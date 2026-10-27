// SPDX-License-Identifier: Apache-2.0

import { useMutation } from '@tanstack/react-query'
import { __, _x } from '@wordpress/i18n'
import { Button, Field, Input, Text } from '@wordpress/ui'
import { useState } from 'react'
import type { ComponentProps, ReactNode } from 'react'

import type { Account } from '../account.js'
import { passwordHint } from '../admin/fieldError.js'
import { ValidationError } from '../api.js'
import { DOMAIN } from '../domain.js'
import { SetupClosedError, SetupCodeError, SiteStartingError, createFirstAccount, isSetupOpen } from '../setup.js'
import type { FirstAccount } from '../setup.js'
import { PasswordField } from './PasswordField.js'
import { setupRefusal } from './setupWords.js'
import { usePasswordField } from './usePasswordField.js'

/** The length of the password the step starts with, unless the wizard asks for another. */
const GENERATED_PASSWORD_LENGTH = 18

/** The wizard's words for an error the step does not know. */
type ErrorWords = (error: unknown) => ReactNode | undefined

/** The wizard's optional callbacks for what a refusal means for it. */
interface RefusalHooks {
	onCodeRefused?: (reason: SetupCodeError['reason']) => void
	onClosed?: () => void
}

/**
 * Renders a sentence with the part between its code tags as code.
 * @param sentence - The translated sentence.
 * @returns The sentence with its code part as markup.
 */
function withCode(sentence: string): ReactNode {
	return sentence.split(/<\/?code>/).map((part, index) => (index % 2 === 1 ? <code key={index}>{part}</code> : part))
}

const validationWords = new Map<string, (meta: Record<string, unknown>) => ReactNode>([
	[
		'email_invalid',
		() =>
			withCode(
				__(
					'Sorry, that is not a valid email address. ' +
						'Email addresses look like <code>username@example.com</code>.',
					DOMAIN,
				),
			),
	],
	['name_required', () => __('Please provide a name.', DOMAIN)],
	['name_too_long', () => __('This name is too long.', DOMAIN)],
	['password_too_short', (meta) => (typeof meta.min === 'number' ? passwordHint(meta.min) : undefined)],
	['password_too_long', () => __('This password is too long.', DOMAIN)],
])

/**
 * Returns the sentence for a validation refusal the step knows.
 * @param error - The error the submit raised.
 * @returns The sentence, or undefined for any other error.
 */
function validationRefusal(error: Error): ReactNode | undefined {
	return error instanceof ValidationError ? validationWords.get(error.code ?? '')?.(error.meta ?? {}) : undefined
}

/**
 * Returns the sentence the step shows for a refused submit.
 * @param error - The error the submit raised.
 * @param onError - The wizard's words for an error the step does not know, if it has any.
 * @returns The sentence to show.
 */
function refusalMessage(error: Error, onError?: ErrorWords): ReactNode {
	return (
		setupRefusal(error) ??
		validationRefusal(error) ??
		onError?.(error) ??
		__('The account could not be created, please try again.', DOMAIN)
	)
}

/**
 * Reports whether a failed submit may already have made the account.
 * @param error - The error the submit raised.
 * @returns True after a 503 or a network failure.
 */
function mayHaveCreated(error: Error): boolean {
	return error instanceof SiteStartingError || error instanceof TypeError
}

/**
 * Asks the site once whether it still waits for its first account, and tells the wizard when it does not.
 * @param onClosed - Called when the site answers that setup is closed.
 */
async function probeClosed(onClosed?: () => void): Promise<void> {
	const open = await isSetupOpen().catch(() => true)
	if (!open) {
		onClosed?.()
	}
}

/**
 * Tells the wizard what a refused submit means for it.
 * @param error - The error the submit raised.
 * @param hooks - The wizard's optional callbacks.
 */
async function reportRefusal(error: Error, hooks: RefusalHooks): Promise<void> {
	if (error instanceof SetupCodeError) {
		hooks.onCodeRefused?.(error.reason)
	} else if (error instanceof SetupClosedError) {
		hooks.onClosed?.()
	} else if (mayHaveCreated(error)) {
		await probeClosed(hooks.onClosed)
	}
}

/**
 * Reports whether the step may send the account, the meter's confirmation included.
 * @param name - The name as typed.
 * @param email - The email as typed.
 * @param passwordReady - Whether the password may be sent.
 * @returns True once every field holds more than spaces and a weak password is confirmed.
 */
function isReady(name: string, email: string, passwordReady: boolean): boolean {
	return name.trim() !== '' && email.trim() !== '' && passwordReady
}

/**
 * Sends the first account once and hands it to the wizard, retrying only the hand-over.
 * @param send - Sends the account, through the wizard's route or the transport.
 * @param onCreated - Called with the account once the site created it.
 * @param onRefused - Called first after every refused submit.
 * @param hooks - The wizard's optional callbacks for a refusal.
 * @returns The submit, its refusal, its busy and locked states, and the retry once a hand-over failed.
 */
function useFirstAccount(
	send: () => Promise<Account>,
	onCreated: (account: Account) => void | Promise<void>,
	onRefused: () => void,
	hooks: RefusalHooks,
) {
	const [created, setCreated] = useState<Account | null>(null)
	const [handoffFailed, setHandoffFailed] = useState(false)
	const finish = useMutation({
		mutationFn: async (account: Account) => {
			await onCreated(account)
		},
		onError: () => setHandoffFailed(true),
		onSuccess: () => setHandoffFailed(false),
	})
	const create = useMutation({
		mutationFn: send,
		onSuccess: (account) => {
			setCreated(account)
			finish.mutate(account)
		},
		onError: async (error) => {
			onRefused()
			await reportRefusal(error, hooks)
		},
	})
	return {
		submit: () => create.mutate(),
		error: create.error,
		busy: create.isPending || finish.isPending,
		locked: create.isPending || create.isSuccess,
		retry: created !== null && handoffFailed ? () => finish.mutate(created) : undefined,
		retrying: finish.isPending,
	}
}

/**
 * Renders a sentence in the message box above the rows.
 * @param children - The sentence.
 * @returns The message box element.
 */
function MessageBox({ children }: { children: ReactNode }) {
	return (
		<Text role="alert" render={<p className="gopherium-setup__message" />}>
			{children}
		</Text>
	)
}

/**
 * Renders the sentence for a refused submit, if there is one.
 * @param error - The error the last submit raised, if any.
 * @param onError - The wizard's words for an error the step does not know.
 * @returns The message box element, or nothing.
 */
function RefusalMessage({ error, onError }: { error: Error | null; onError?: ErrorWords }) {
	return error === null ? null : <MessageBox>{refusalMessage(error, onError)}</MessageBox>
}

/**
 * Renders one labelled field row of the step, with its help line when it has one.
 * @param label - The field's label.
 * @param help - The line under the field, if any.
 * @returns The row element.
 */
function TextRow({ label, help, ...field }: { label: string; help?: string } & ComponentProps<typeof Input>) {
	return (
		<Field.Root className="gopherium-setup__row" render={<div />}>
			<Field.Label className="gopherium-setup__label">{label}</Field.Label>
			<div>
				<Input {...field} />
				{help === undefined ? null : <Field.Description className="gopherium-setup__help">{help}</Field.Description>}
			</div>
		</Field.Root>
	)
}

/**
 * Renders the sentence and the button that hand the created account to the wizard again.
 * @param pending - Whether the hand-over runs.
 * @param onRetry - Called when the button is pressed.
 * @returns The hand-over failure element.
 */
function HandoffFailure({ pending, onRetry }: { pending: boolean; onRetry: () => void }) {
	return (
		<div className="gopherium-setup">
			<MessageBox>{__('Something went wrong.', DOMAIN)}</MessageBox>
			<p className="gopherium-setup__step">
				<Button type="button" disabled={pending} loading={pending} onClick={onRetry}>
					{__('Try again', DOMAIN)}
				</Button>
			</p>
		</div>
	)
}

/**
 * Renders the first account's Name, Password and Your Email rows inside an application's setup wizard.
 * @param code - The one-time setup code the wizard collected before this step.
 * @param submitLabel - The wizard's words for the submit button.
 * @param onCreated - Called with the account once the site created it.
 * @param onSubmit - Sends the account through the wizard's own route, in place of the transport.
 * @param onError - The wizard's words for an error the step does not know.
 * @param onCodeRefused - Called with the reason when the site refuses the setup code.
 * @param onClosed - Called when the site already has its first account.
 * @param generatedPasswordLength - The length of the password the step starts with.
 * @param userInputs - The wizard's own values the meter treats as easy to guess.
 * @param before - The wizard's rows above Name.
 * @param after - The wizard's rows below Your Email.
 * @returns The setup account step element.
 */
export function SetupAccountStep({
	code,
	submitLabel,
	onCreated,
	onSubmit,
	onError,
	onCodeRefused,
	onClosed,
	generatedPasswordLength,
	userInputs,
	before,
	after,
}: {
	code: string
	submitLabel: string
	onCreated: (account: Account) => void | Promise<void>
	onSubmit?: (input: FirstAccount) => Promise<Account>
	onError?: ErrorWords
	onCodeRefused?: (reason: SetupCodeError['reason']) => void
	onClosed?: () => void
	generatedPasswordLength?: number
	userInputs?: string[]
	before?: ReactNode
	after?: ReactNode
}) {
	const [name, setName] = useState('')
	const [email, setEmail] = useState('')
	const password = usePasswordField({
		length: generatedPasswordLength ?? GENERATED_PASSWORD_LENGTH,
		userInputs: [name, email, ...(userInputs ?? [])],
	})
	const account = useFirstAccount(
		() => (onSubmit ?? createFirstAccount)({ code, email: email.trim(), name: name.trim(), password: password.value }),
		onCreated,
		() => password.mask(false),
		{ onCodeRefused, onClosed },
	)
	if (account.retry !== undefined) {
		return <HandoffFailure pending={account.retrying} onRetry={account.retry} />
	}
	const canSend = !account.locked && isReady(name, email, password.ready)
	return (
		<form
			className="gopherium-setup"
			noValidate
			onSubmit={(event) => {
				event.preventDefault()
				if (!canSend) {
					return
				}
				password.mask(true)
				account.submit()
			}}
		>
			<RefusalMessage error={account.error} onError={onError} />
			{before}
			<TextRow
				label={_x('Name', 'field label', DOMAIN)}
				type="text"
				autoComplete="name"
				value={name}
				readOnly={account.locked}
				onChange={(event) => setName(event.target.value)}
			/>
			<PasswordField
				password={password}
				readOnly={account.locked}
				help={
					<>
						<strong>{__('Important:', DOMAIN)}</strong>{' '}
						{__('You will need this password to log\u00a0in. Please store it in a secure location.', DOMAIN)}
					</>
				}
			/>
			<TextRow
				label={__('Your Email', DOMAIN)}
				type="email"
				autoComplete="username"
				value={email}
				readOnly={account.locked}
				onChange={(event) => setEmail(event.target.value)}
				help={__('Double-check your email address before continuing.', DOMAIN)}
			/>
			{after}
			<p className="gopherium-setup__step">
				<Button type="submit" disabled={!canSend} loading={account.busy}>
					{submitLabel}
				</Button>
			</p>
		</form>
	)
}
