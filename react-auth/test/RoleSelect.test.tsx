// SPDX-License-Identifier: Apache-2.0

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { expect, test, vi } from 'vitest'

import { RoleSelect } from '../src/wpds/users'

vi.mock('@wordpress/ui', async (importOriginal) => ({
	...(await importOriginal<typeof import('@wordpress/ui')>()),
	SelectControl: ({ label, onValueChange }: { label: string; onValueChange: (item: null) => void }) => (
		<button type="button" onClick={() => onValueChange(null)}>{`Clear ${label}`}</button>
	),
}))

function Picker() {
	const [role, setRole] = useState('member')
	return (
		<>
			<RoleSelect grantable={['admin', 'member']} value={role} onChange={setRole} />
			<output>{role === '' ? 'none' : role}</output>
		</>
	)
}

test('hands back no role when the select hands back no choice', async () => {
	render(<Picker />)

	await userEvent.click(screen.getByRole('button', { name: 'Clear Role' }))

	expect(screen.getByRole('status')).toHaveTextContent('none')
})
