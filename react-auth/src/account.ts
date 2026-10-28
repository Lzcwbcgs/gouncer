// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod'

/** The account the server answers for a listed or created user. */
export const accountSchema = z.object({
	id: z.string(),
	email: z.string(),
	name: z.string(),
	disabled: z.boolean(),
	confirmed: z.boolean(),
	role: z.string().default(''),
	created_at: z.coerce.date(),
	editable: z.boolean(),
	avatar: z.string().optional(),
})

/** Account is a user account as the server answers it. */
export type Account = z.infer<typeof accountSchema>
