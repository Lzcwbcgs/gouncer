// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'

import { createUser, fetchUsers } from '../src/admin'
import { HttpResponse, http, server } from '../src/testing'

const listed = {
	id: '0198b2f0-0000-7000-8000-000000000003',
	email: 'maria@example.com',
	name: 'Maria Perez',
	disabled: false,
	confirmed: false,
	role: 'member',
	created_at: '2026-10-19T10:00:00Z',
	editable: true,
	avatar: 'https://example.com/avatar/maria.png',
}

describe('an account the server lists', () => {
	it('carries whether it is confirmed, whether the reader may edit it and its avatar', async () => {
		server.use(http.get('/api/users', () => HttpResponse.json([listed])))

		const [account] = await fetchUsers()

		expect(account).toMatchObject({
			confirmed: false,
			editable: true,
			avatar: 'https://example.com/avatar/maria.png',
		})
	})

	it('reads an account sent without an avatar as having none', async () => {
		const { avatar: _avatar, ...withoutAvatar } = listed
		server.use(http.get('/api/users', () => HttpResponse.json([withoutAvatar])))

		const [account] = await fetchUsers()

		expect(account.avatar).toBeUndefined()
		expect(account).not.toHaveProperty('avatar')
	})

	it.each(['editable', 'confirmed'])('refuses an account sent without %s', async (field) => {
		const { [field as keyof typeof listed]: _dropped, ...partial } = listed
		server.use(http.get('/api/users', () => HttpResponse.json([partial])))

		await expect(fetchUsers()).rejects.toThrow(field)
	})

	it.each(['editable', 'confirmed'])('refuses an account whose %s is not a flag', async (field) => {
		server.use(http.get('/api/users', () => HttpResponse.json([{ ...listed, [field]: 'yes' }])))

		await expect(fetchUsers()).rejects.toThrow(field)
	})
})

describe('the account a create answers', () => {
	it('carries whether the reader may edit it', async () => {
		server.use(http.post('/api/users', () => HttpResponse.json({ ...listed, confirmed: true }, { status: 201 })))

		const created = await createUser({
			email: listed.email,
			name: listed.name,
			password: 'correct horse battery',
			role: 'member',
		})

		expect(created).toMatchObject({ confirmed: true, editable: true })
	})
})
