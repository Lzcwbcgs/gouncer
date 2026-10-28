// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'

import {
	LastPrivilegedError,
	RoleChangedError,
	RoleNotGrantableError,
	RoleRefusedError,
	RoleUnknownError,
	SelfDisableError,
	SelfRoleError,
	UserNotEditableError,
	UserNotFoundError,
	fetchUsers,
	resendInvite,
	setUserDisabled,
	setUserRole,
} from '../src/admin'
import {
	accountWithRole,
	disabledOk,
	disabledRefused,
	resendDelivered,
	resendRefused,
	resendUndelivered,
	roleRefused,
	server,
	userWithRole,
	usersFailure,
	usersOk,
} from '../src/testing'

/**
 * Returns what a write rejected with.
 * @param attempt - The write under test.
 * @returns The rejection, or undefined when the write resolved.
 */
async function rejectionOf(attempt: Promise<unknown>): Promise<unknown> {
	return attempt.then(
		() => undefined,
		(held: unknown) => held,
	)
}

describe('accountWithRole', () => {
	it('cans a listed account under the identity userWithRole gives that role', () => {
		const account = accountWithRole('editor')
		const { id, email, name } = userWithRole('editor')

		expect(account).toEqual({
			id,
			email,
			name,
			role: 'editor',
			disabled: false,
			confirmed: true,
			editable: true,
			created_at: new Date('2026-10-19T10:00:00Z'),
		})
	})

	it('takes the changes a test asks for', () => {
		expect(accountWithRole('member', { confirmed: false, editable: false, avatar: 'https://example.com/a.png' }))
			.toMatchObject({ role: 'member', confirmed: false, editable: false, avatar: 'https://example.com/a.png' })
	})
})

describe('usersOk', () => {
	it('lists the accounts it is given', async () => {
		const pending = accountWithRole('member', { confirmed: false })
		server.use(usersOk([accountWithRole('admin'), pending]))

		const listed = await fetchUsers()

		expect(listed).toEqual([accountWithRole('admin'), pending])
	})
})

describe('usersFailure', () => {
	it('fails the account list with a server error', async () => {
		server.use(usersFailure())

		await expect(fetchUsers()).rejects.toThrow('500')
	})
})

describe('disabledOk', () => {
	it.each([true, false])('accepts setting disabled to %s', async (disabled) => {
		server.use(disabledOk())

		await expect(setUserDisabled(accountWithRole('member').id, disabled)).resolves.toBeUndefined()
	})
})

describe('disabledRefused', () => {
	it.each([
		{ code: 'self_disable_refused', type: SelfDisableError },
		{ code: 'last_privileged_refused', type: LastPrivilegedError },
		{ code: 'user_not_found', type: UserNotFoundError },
		{ code: 'user_not_editable', type: UserNotEditableError },
		{ code: 'role_not_grantable', type: RoleNotGrantableError },
		{ code: 'role_changed', type: RoleChangedError },
		{ code: 'role_insufficient', type: RoleRefusedError },
	] as const)('answers $code as authkit does', async ({ code, type }) => {
		server.use(disabledRefused(code))

		const thrown = await rejectionOf(setUserDisabled(accountWithRole('member').id, true))

		expect(thrown).toBeInstanceOf(type)
		expect(thrown).toMatchObject({ code })
	})
})

describe('roleRefused', () => {
	it.each([
		{ code: 'role_insufficient', type: RoleRefusedError, message: 'role insufficient' },
		{ code: 'self_role_refused', type: SelfRoleError, message: 'cannot change your own role' },
		{ code: 'last_privileged_refused', type: LastPrivilegedError, message: 'the last privileged account must remain' },
		{ code: 'user_not_found', type: UserNotFoundError, message: 'user not found' },
		{
			code: 'user_not_editable',
			type: UserNotEditableError,
			message: 'Sorry, you are not allowed to edit this user.',
		},
		{
			code: 'role_not_grantable',
			type: RoleNotGrantableError,
			message: 'Sorry, you are not allowed to give users that role.',
		},
		{ code: 'role_unknown', type: RoleUnknownError, message: 'unknown role' },
		{ code: 'role_changed', type: RoleChangedError, message: 'role changed' },
	] as const)('answers $code with the message authkit sends', async ({ code, type, message }) => {
		server.use(roleRefused(code))

		const thrown = await rejectionOf(setUserRole(accountWithRole('member').id, 'editor'))

		expect(thrown).toBeInstanceOf(type)
		expect(thrown).toMatchObject({ code, message })
	})
})

describe('the resend handlers', () => {
	it('answers a resend as mailed', async () => {
		server.use(resendDelivered())

		await expect(resendInvite('member@example.com')).resolves.toEqual({ delivered: true })
	})

	it('answers a resend with the by-hand link', async () => {
		server.use(resendUndelivered('https://example.com/activate?token=t-789'))

		await expect(resendInvite('member@example.com')).resolves.toEqual({
			delivered: false,
			activation_link: 'https://example.com/activate?token=t-789',
		})
	})

	it('answers a resend with an error code as authkit does', async () => {
		server.use(resendRefused('user_not_editable'))

		await expect(resendInvite('member@example.com')).rejects.toBeInstanceOf(UserNotEditableError)
	})
})
