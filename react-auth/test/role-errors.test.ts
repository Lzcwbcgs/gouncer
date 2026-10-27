// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'

import {
	RoleChangedError,
	RoleNotGrantableError,
	RoleRefusedError,
	RoleUnknownError,
	SelfRoleError,
	UserNotEditableError,
	ValidationError,
	createUser,
	invite,
	setUserDisabled,
	setUserRole,
} from '../src/admin'
import { HttpResponse, http, server } from '../src/testing'

const id = '0198b2f0-0000-7000-8000-000000000002'

const writes = [
	{
		name: 'createUser',
		failure: 'creating user',
		handler: (response: () => Response) => http.post('/api/users', response),
		run: () =>
			createUser({ email: 'maria@example.com', name: 'Maria Perez', password: 'correct horse battery', role: 'x' }),
	},
	{
		name: 'invite',
		failure: 'inviting',
		handler: (response: () => Response) => http.post('/api/users/invite', response),
		run: () => invite({ email: 'maria@example.com', name: 'Maria Perez', role: 'x' }),
	},
	{
		name: 'setUserRole',
		failure: 'updating role',
		handler: (response: () => Response) => http.put('/api/users/:id/role', response),
		run: () => setUserRole(id, 'x'),
	},
	{
		name: 'setUserDisabled',
		failure: 'updating user',
		handler: (response: () => Response) => http.patch('/api/users/:id', response),
		run: () => setUserDisabled(id, false),
	},
]

const typedErrors = [
	{
		title: 'RoleUnknownError for a role nobody declared',
		type: RoleUnknownError,
		status: 422,
		body: { error: 'unknown role', code: 'role_unknown', meta: { field: 'role' } },
	},
	{
		title: 'UserNotEditableError for an account the reader may not edit',
		type: UserNotEditableError,
		status: 403,
		body: { error: 'Sorry, you are not allowed to edit this user.', code: 'user_not_editable' },
	},
	{
		title: 'RoleNotGrantableError for a role the reader may not give',
		type: RoleNotGrantableError,
		status: 403,
		body: { error: 'Sorry, you are not allowed to give users that role.', code: 'role_not_grantable' },
	},
]

describe.each(writes)('$name', ({ failure, handler, run }) => {
	it.each(typedErrors)('throws $title', async ({ type, status, body }) => {
		server.use(handler(() => HttpResponse.json(body, { status })))

		const attempt = run()

		await expect(attempt).rejects.toBeInstanceOf(type)
		await expect(attempt).rejects.toMatchObject({ code: body.code, message: body.error })
	})

	it.each(['role_beyond_reach', 'constructor', 'toString', '__proto__', 'hasOwnProperty'])(
		'answers the code %s as a plain error naming the status',
		async (code) => {
			server.use(handler(() => HttpResponse.json({ error: 'odd', code }, { status: 403 })))

			await expect(run()).rejects.toThrow(`${failure} failed with status 403`)
		},
	)
})

describe.each(writes.filter(({ name }) => name === 'setUserRole' || name === 'setUserDisabled'))(
	'$name on an account whose role moved',
	({ handler, run }) => {
		it('throws RoleChangedError', async () => {
			server.use(
				handler(() =>
					HttpResponse.json(
						{ error: 'the role changed, reload the account', code: 'role_changed' },
						{ status: 409 },
					),
				),
			)

			const attempt = run()

			await expect(attempt).rejects.toBeInstanceOf(RoleChangedError)
			await expect(attempt).rejects.toMatchObject({
				code: 'role_changed',
				message: 'the role changed, reload the account',
			})
		})
	},
)

describe('RoleUnknownError', () => {
	it('stays a ValidationError, so a screen that reads only that still shows the message', async () => {
		server.use(
			http.post('/api/users', () =>
				HttpResponse.json({ error: 'unknown role', code: 'role_unknown' }, { status: 422 }),
			),
		)

		await expect(
			createUser({ email: 'maria@example.com', name: 'Maria Perez', password: 'correct horse battery' }),
		).rejects.toBeInstanceOf(ValidationError)
	})
})

const insufficient = { error: 'role insufficient', code: 'role_insufficient' }

const plainErrors = [
	{
		title: 'createUser answering any other 403',
		handler: (response: () => Response) => http.post('/api/users', response),
		run: () => createUser({ email: 'maria@example.com', name: 'Maria Perez', password: 'correct horse battery' }),
		status: 403,
		body: insufficient,
		failure: '403',
		wrongTypes: [RoleRefusedError],
	},
	{
		title: 'invite answering a role_insufficient 403',
		handler: (response: () => Response) => http.post('/api/users/invite', response),
		run: () => invite({ email: 'maria@example.com', name: 'Maria Perez' }),
		status: 403,
		body: insufficient,
		failure: 'inviting failed with status 403',
		wrongTypes: [RoleRefusedError],
	},
	{
		title: 'setUserDisabled answering a self_role_refused 422',
		handler: (response: () => Response) => http.patch('/api/users/:id', response),
		run: () => setUserDisabled(id, true),
		status: 422,
		body: { error: 'cannot change your own role', code: 'self_role_refused' },
		failure: 'updating user failed with status 422',
		wrongTypes: [ValidationError, SelfRoleError],
	},
]

describe('an error carrying another code', () => {
	it.each(plainErrors)('keeps $title as a plain error', async ({ handler, run, status, body, failure, wrongTypes }) => {
		server.use(handler(() => HttpResponse.json(body, { status })))

		const attempt = run()

		await expect(attempt).rejects.toThrow(failure)
		for (const type of wrongTypes) {
			await expect(attempt).rejects.not.toBeInstanceOf(type)
		}
	})

	it('keeps setUserDisabled answering an unreadable error body by its status', async () => {
		server.use(http.patch('/api/users/:id', () => new HttpResponse('not json at all', { status: 403 })))

		await expect(setUserDisabled(id, true)).rejects.toThrow('403')
	})
})
