// SPDX-License-Identifier: Apache-2.0

import { ConfirmBody, useCloseWhileOpen, useToaster } from '@gopherium/godmin'
import { useMutation } from '@tanstack/react-query'
import type { RenderModalProps } from '@wordpress/dataviews'
import { __, sprintf } from '@wordpress/i18n'
import { Button, InputControl, Stack, Text } from '@wordpress/ui'
import { useState } from 'react'

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
 * @param props - The account, what closes the dialog and the words the app gives its own error codes.
 * @returns The confirm, or the activation link once the server hands it back.
 */
export function ResendModal({
	items: [account],
	closeModal,
	errorMessages,
}: RenderModalProps<Account> & { errorMessages: ErrorMessages }) {
	const toaster = useToaster()
	const close = useCloseWhileOpen(closeModal)
	const [link, setLink] = useState<string>()
	const resend = useMutation({
		mutationFn: () => resendInvite(account.email),
		onSuccess: (sent) => {
			if (sent.delivered) {
				toaster.show(sprintf(__('Invitation sent to "%(name)s".', DOMAIN), { name: account.name }))
				close()
				return
			}
			setLink(sent.activation_link)
		},
		onError: (error) => {
			toaster.show(errorMessageOf(error, errorMessages, __('The invitation could not be sent.', DOMAIN)))
			close()
		},
	})
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
