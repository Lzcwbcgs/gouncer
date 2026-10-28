// SPDX-License-Identifier: Apache-2.0

import { ConfirmBody, markLatest, useCloseWhileOpen, useToaster } from '@gopherium/godmin'
import type { UnsavedText } from '@gopherium/godmin'
import { useMutation } from '@tanstack/react-query'
import type { RenderModalProps } from '@wordpress/dataviews'
import { __, sprintf } from '@wordpress/i18n'
import { Button, InputControl, Stack, Text } from '@wordpress/ui'
import { useEffect, useState } from 'react'

import type { Account } from '../../account.js'
import { resendInvite } from '../../admin/index.js'
import { DOMAIN } from '../../domain.js'
import { errorMessageOf } from './words.js'
import type { ErrorMessages } from './words.js'

/**
 * Renders the activation link to deliver by hand when no mail server sent the invitation.
 * @param props - The link and what closes the dialog.
 * @returns The link, read only, above Done.
 */
function HandDelivery({ link, onDone }: { link: string; onDone?: () => void }) {
	return (
		<Stack direction="column" gap="lg">
			<Text>{__('No mail server is configured. Deliver the activation link by hand.', DOMAIN)}</Text>
			<InputControl label={__('Activation link', DOMAIN)} readOnly value={link} />
			<Stack direction="row" justify="flex-end">
				<Button onClick={onDone}>{__('Done', DOMAIN)}</Button>
			</Stack>
		</Stack>
	)
}

/**
 * Renders the confirm sending a pending account a new invitation, closing only itself once the write ends.
 * @param props - The account, what closes the dialog, the kept activation links and the app's own error words.
 * @returns The confirm, or the activation link the server answered, kept for the next open if the dialog closed first.
 */
export function ResendModal({
	items: [account],
	closeModal,
	links,
	errorMessages,
}: RenderModalProps<Account> & { links: UnsavedText; errorMessages: ErrorMessages }) {
	const toaster = useToaster()
	const close = useCloseWhileOpen(closeModal)
	const [link, setLink] = useState(() => links.get(account.id))
	const resend = useMutation({
		mutationFn: () => resendInvite(account.email),
		onMutate: () => markLatest(links, account.id),
		onSuccess: (sent, _, stillLatest) => {
			if (sent.delivered) {
				toaster.show(sprintf(__('Invitation sent to "%(name)s".', DOMAIN), { name: account.name }))
				close()
				return
			}
			if (stillLatest()) {
				links.set(account.id, sent.activation_link)
			}
			setLink(sent.activation_link)
		},
		onError: (error) => {
			toaster.show(errorMessageOf(error, errorMessages, __('The invitation could not be sent.', DOMAIN)))
			close()
		},
	})
	useEffect(() => {
		if (link === undefined) {
			return undefined
		}
		return () => {
			links.delete(account.id)
		}
	}, [link, links, account.id])
	if (link !== undefined) {
		return <HandDelivery link={link} onDone={closeModal} />
	}
	const question = __('Send a new invitation to "%(name)s" (%(email)s)? The link sent before stops working.', DOMAIN)
	return (
		<ConfirmBody
			confirmLabel={__('Resend invitation', DOMAIN)}
			cancelLabel={__('Cancel', DOMAIN)}
			busy={resend.isPending}
			onConfirm={() => resend.mutate()}
			onCancel={closeModal}
		>
			{sprintf(question, { name: account.name, email: account.email })}
		</ConfirmBody>
	)
}
