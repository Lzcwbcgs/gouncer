// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'

import {
	EmailTakenError,
	RoleNotGrantableError,
	RoleUnknownError,
	ValidationError,
	createUser,
	fieldError,
} from '../src/admin'
import { HttpResponse, http, server } from '../src/testing'

const hintFor12 =
	'Hint: The password should be at least 12 characters long. ' +
	'To make it stronger, use upper and lower case letters, numbers, and symbols like ! " ? $ % ^ & ).'

describe('fieldError', () => {
	it.each([
		{
			code: 'email_invalid',
			field: 'email',
			message: 'The email address is not correct.',
		},
		{ code: 'name_required', field: 'name', message: 'Please provide a name.' },
		{ code: 'name_too_long', field: 'name', message: 'This name is too long.' },
		{ code: 'password_too_long', field: 'password', message: 'This password is too long.' },
	])('puts $code under the $field field', ({ code, field, message }) => {
		expect(fieldError(new ValidationError('the server said no', { code }))).toEqual({ field, message })
	})

	it('puts a taken address under the email field', () => {
		expect(fieldError(new EmailTakenError('email already in use'))).toEqual({
			field: 'email',
			message: 'This email is already registered. Please choose another one.',
		})
	})

	it('puts a short password under the password field with the minimum the server sent', () => {
		const tooShort = new ValidationError('password must be at least 12 characters', {
			code: 'password_too_short',
			meta: { min: 12 },
		})

		expect(fieldError(tooShort)).toEqual({ field: 'password', message: hintFor12 })
	})

	it('says character for a minimum of one', () => {
		const tooShort = new ValidationError('too short', { code: 'password_too_short', meta: { min: 1 } })

		expect(fieldError(tooShort)?.message).toContain('at least 1 character long.')
	})

	it('names no field for a short password sent without a minimum', () => {
		expect(fieldError(new ValidationError('too short', { code: 'password_too_short' }))).toBeUndefined()
	})

	it('names no field for a minimum that is not a number', () => {
		const tooShort = new ValidationError('too short', { code: 'password_too_short', meta: { min: '12' } })

		expect(fieldError(tooShort)).toBeUndefined()
	})

	it.each([
		{ name: 'a role nobody declared', error: new RoleUnknownError('unknown role') },
		{ name: 'a role the reader may not give', error: new RoleNotGrantableError('not that role') },
		{ name: 'a validation error with no code', error: new ValidationError('odd') },
		{ name: 'a validation error with another code', error: new ValidationError('odd', { code: 'body_malformed' }) },
		{ name: 'a plain error', error: new Error('500') },
		{ name: 'a value that is no error', error: 'email_taken' },
	])('names no field for $name', ({ error }) => {
		expect(fieldError(error)).toBeUndefined()
	})
})

describe('fieldError after a create the server turned down', () => {
	it('reads the minimum the server sent with the code', async () => {
		server.use(
			http.post('/api/users', () =>
				HttpResponse.json(
					{ error: 'password must be at least 12 characters', code: 'password_too_short', meta: { min: 12 } },
					{ status: 422 },
				),
			),
		)

		const thrown = await createUser({ email: 'maria@example.com', name: 'Maria Perez', password: 'short' }).then(
			() => undefined,
			(held: unknown) => held,
		)

		expect(fieldError(thrown)).toEqual({ field: 'password', message: hintFor12 })
	})

	it('reads a taken address', async () => {
		server.use(
			http.post('/api/users', () =>
				HttpResponse.json({ error: 'email already in use', code: 'email_taken' }, { status: 409 }),
			),
		)

		const thrown = await createUser({
			email: 'maria@example.com',
			name: 'Maria Perez',
			password: 'correct horse battery',
		}).then(
			() => undefined,
			(held: unknown) => held,
		)

		expect(fieldError(thrown)).toMatchObject({ field: 'email' })
	})
})
