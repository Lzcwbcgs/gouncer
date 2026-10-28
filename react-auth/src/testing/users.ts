// SPDX-License-Identifier: Apache-2.0

import { HttpResponse, http } from 'msw'

import type { Account } from '../account.js'

/** The status, message and meta the server answers each account write's error code with. */
const accountErrors = {
	role_insufficient: { status: 403, error: 'role insufficient' },
	user_not_found: { status: 404, error: 'user not found' },
	user_not_editable: { status: 403, error: 'Sorry, you are not allowed to edit this user.' },
	role_not_grantable: { status: 403, error: 'Sorry, you are not allowed to give users that role.' },
	role_unknown: { status: 422, error: 'unknown role', meta: { field: 'role' } },
	role_changed: { status: 409, error: 'role changed' },
	self_disable_refused: { status: 422, error: 'cannot disable your own account' },
	self_role_refused: { status: 422, error: 'cannot change your own role' },
	last_privileged_refused: { status: 422, error: 'the last privileged account must remain' },
}

/** An error code the server answers an account write with. */
type AccountErrorCode = keyof typeof accountErrors

/**
 * Answers an account write with an error code as the server does.
 * @param code - The error code.
 * @returns The msw response.
 */
function errorAnswer(code: AccountErrorCode) {
	const { status, ...body } = accountErrors[code]
	return HttpResponse.json({ ...body, code }, { status })
}

/**
 * Lists the given accounts.
 * @param accounts - The accounts the list answers.
 * @returns The msw handler.
 */
export function usersOk(accounts: Account[]) {
	return http.get('/api/users', () => HttpResponse.json(accounts))
}

/**
 * Fails the account list with a server error.
 * @returns The msw handler.
 */
export function usersFailure() {
	return http.get('/api/users', () => HttpResponse.json({ error: 'internal error', code: 'internal' }, { status: 500 }))
}

/**
 * Accepts an Enable or a Disable.
 * @returns The msw handler.
 */
export function disabledOk() {
	return http.patch('/api/users/:id', () => new HttpResponse(null, { status: 204 }))
}

/**
 * Turns down an Enable or a Disable with the given error code.
 * @param code - The error code the server answers.
 * @returns The msw handler.
 */
export function disabledRefused(code: AccountErrorCode) {
	return http.patch('/api/users/:id', () => errorAnswer(code))
}

/**
 * Turns down a role change with the given error code.
 * @param code - The error code the server answers.
 * @returns The msw handler.
 */
export function roleRefused(code: AccountErrorCode) {
	return http.put('/api/users/:id/role', () => errorAnswer(code))
}

/**
 * Answers a resent invitation as mailed.
 * @returns The msw handler.
 */
export function resendDelivered() {
	return http.post('/api/users/invite/resend', () => HttpResponse.json({ delivered: true }))
}

/**
 * Answers a resent invitation with the by-hand activation link.
 * @param link - The activation link the admin delivers by hand.
 * @returns The msw handler.
 */
export function resendUndelivered(link: string) {
	return http.post('/api/users/invite/resend', () => HttpResponse.json({ delivered: false, activation_link: link }))
}

/**
 * Turns down a resent invitation with the given error code.
 * @param code - The error code the server answers.
 * @returns The msw handler.
 */
export function resendRefused(code: AccountErrorCode) {
	return http.post('/api/users/invite/resend', () => errorAnswer(code))
}
