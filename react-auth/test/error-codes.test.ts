// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'

import * as admin from '../src/admin'
import {
	EmailTakenError,
	LastPrivilegedError,
	RoleChangedError,
	RoleNotGrantableError,
	RoleRefusedError,
	RoleUnknownError,
	SelfDisableError,
	SelfRoleError,
	UserNotEditableError,
	UserNotFoundError,
	ValidationError,
	createUser,
	invite,
	setUserDisabled,
	setUserRole,
} from '../src/admin'
import { HttpResponse, http, server } from '../src/testing'

const id = '0198b2f0-0000-7000-8000-000000000002'

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

describe('every typed error', () => {
	it.each([
		{ name: 'EmailTakenError', type: EmailTakenError, code: 'email_taken' },
		{ name: 'RoleRefusedError', type: RoleRefusedError, code: 'role_insufficient' },
		{ name: 'SelfRoleError', type: SelfRoleError, code: 'self_role_refused' },
		{ name: 'SelfDisableError', type: SelfDisableError, code: 'self_disable_refused' },
		{ name: 'LastPrivilegedError', type: LastPrivilegedError, code: 'last_privileged_refused' },
		{ name: 'RoleUnknownError', type: RoleUnknownError, code: 'role_unknown' },
		{ name: 'UserNotEditableError', type: UserNotEditableError, code: 'user_not_editable' },
		{ name: 'RoleNotGrantableError', type: RoleNotGrantableError, code: 'role_not_grantable' },
		{ name: 'RoleChangedError', type: RoleChangedError, code: 'role_changed' },
		{ name: 'UserNotFoundError', type: UserNotFoundError, code: 'user_not_found' },
	])('$name carries the code $code, even when a transport throws it', ({ type, code }) => {
		const thrown = new type('the server said no')

		expect(thrown.code).toBe(code)
		expect(thrown.message).toBe('the server said no')
		expect(thrown).toBeInstanceOf(Error)
	})

	it('keeps RoleUnknownError a ValidationError', () => {
		expect(new RoleUnknownError('unknown role')).toBeInstanceOf(ValidationError)
	})

	it('leaves no error class for the retired code role_beyond_reach', () => {
		expect(Object.keys(admin)).not.toContain('RoleBeyondReachError')
	})
})

describe('setUserDisabled', () => {
	it.each([
		{ code: 'self_disable_refused', status: 422, error: 'cannot disable your own account', type: SelfDisableError },
		{
			code: 'last_privileged_refused',
			status: 422,
			error: 'the last privileged account must remain',
			type: LastPrivilegedError,
		},
		{ code: 'user_not_found', status: 404, error: 'user not found', type: UserNotFoundError },
		{
			code: 'user_not_editable',
			status: 403,
			error: 'Sorry, you are not allowed to edit this user.',
			type: UserNotEditableError,
		},
		{
			code: 'role_not_grantable',
			status: 403,
			error: 'Sorry, you are not allowed to give users that role.',
			type: RoleNotGrantableError,
		},
		{ code: 'role_changed', status: 409, error: 'role changed', type: RoleChangedError },
		{ code: 'role_insufficient', status: 403, error: 'role insufficient', type: RoleRefusedError },
	])('throws the typed error for $code with its code and message', async ({ code, status, error, type }) => {
		server.use(http.patch('/api/users/:id', () => HttpResponse.json({ error, code }, { status })))

		const thrown = await rejectionOf(setUserDisabled(id, true))

		expect(thrown).toBeInstanceOf(type)
		expect(thrown).toMatchObject({ code, message: error })
	})
})

describe('setUserRole', () => {
	it.each([
		{ code: 'user_not_found', status: 404, error: 'user not found', type: UserNotFoundError },
		{ code: 'role_insufficient', status: 403, error: 'role insufficient', type: RoleRefusedError },
		{ code: 'self_role_refused', status: 422, error: 'cannot change your own role', type: SelfRoleError },
		{
			code: 'last_privileged_refused',
			status: 422,
			error: 'the last privileged account must remain',
			type: LastPrivilegedError,
		},
	])('throws the typed error for $code with its code and message', async ({ code, status, error, type }) => {
		server.use(http.put('/api/users/:id/role', () => HttpResponse.json({ error, code }, { status })))

		const thrown = await rejectionOf(setUserRole(id, 'member'))

		expect(thrown).toBeInstanceOf(type)
		expect(thrown).toMatchObject({ code, message: error })
	})
})

describe('createUser', () => {
	it('throws EmailTakenError carrying its code for an address in use', async () => {
		server.use(
			http.post('/api/users', () =>
				HttpResponse.json({ error: 'email already in use', code: 'email_taken' }, { status: 409 }),
			),
		)

		const thrown = await rejectionOf(
			createUser({ email: 'maria@example.com', name: 'Maria Perez', password: 'correct horse battery' }),
		)

		expect(thrown).toBeInstanceOf(EmailTakenError)
		expect(thrown).toMatchObject({ code: 'email_taken' })
	})
})

describe.each([
	{
		name: 'createUser',
		handler: (response: () => Response) => http.post('/api/users', response),
		run: () => createUser({ email: 'maria@example.com', name: 'Maria Perez', password: 'short' }),
	},
	{
		name: 'invite',
		handler: (response: () => Response) => http.post('/api/users/invite', response),
		run: () => invite({ email: 'maria@example.com', name: 'Maria Perez' }),
	},
])('$name on details the server turns down', ({ handler, run }) => {
	it('throws ValidationError carrying the code and meta the server sent', async () => {
		server.use(
			handler(() =>
				HttpResponse.json(
					{ error: 'password must be at least 12 characters', code: 'password_too_short', meta: { min: 12 } },
					{ status: 422 },
				),
			),
		)

		const thrown = await rejectionOf(run())

		expect(thrown).toBeInstanceOf(ValidationError)
		expect(thrown).toMatchObject({
			code: 'password_too_short',
			meta: { min: 12 },
			message: 'password must be at least 12 characters',
		})
	})
})
