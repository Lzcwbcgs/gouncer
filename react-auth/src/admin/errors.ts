// SPDX-License-Identifier: Apache-2.0

import { ValidationError } from '../api.js'

/**
 * EmailTakenError is thrown when a new user's email is already in use.
 */
export class EmailTakenError extends Error {
	readonly code = 'email_taken'
}

/**
 * RoleRefusedError is thrown when the actor holds no role the server admits.
 */
export class RoleRefusedError extends Error {
	readonly code = 'role_insufficient'
}

/**
 * SelfRoleError is thrown when an account changes its own role.
 */
export class SelfRoleError extends Error {
	readonly code = 'self_role_refused'
}

/**
 * SelfDisableError is thrown when an account disables itself.
 */
export class SelfDisableError extends Error {
	readonly code = 'self_disable_refused'
}

/**
 * LastPrivilegedError is thrown when a write would leave no enabled
 * account holding a privileged role.
 */
export class LastPrivilegedError extends Error {
	readonly code = 'last_privileged_refused'
}

/**
 * RoleUnknownError is thrown when a write names a role nobody declared.
 */
export class RoleUnknownError extends ValidationError {
	override readonly code = 'role_unknown'
}

/**
 * UserNotEditableError is thrown when the reader may not edit the account.
 */
export class UserNotEditableError extends Error {
	readonly code = 'user_not_editable'
}

/**
 * RoleNotGrantableError is thrown when the reader may not give the role.
 */
export class RoleNotGrantableError extends Error {
	readonly code = 'role_not_grantable'
}

/**
 * RoleChangedError is thrown when the account's role changed before the write landed.
 */
export class RoleChangedError extends Error {
	readonly code = 'role_changed'
}

/**
 * UserNotFoundError is thrown when no account has the identifier a write names.
 */
export class UserNotFoundError extends Error {
	readonly code = 'user_not_found'
}
