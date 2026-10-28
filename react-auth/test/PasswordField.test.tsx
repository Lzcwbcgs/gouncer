// SPDX-License-Identifier: Apache-2.0

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InputControl } from '@wordpress/ui'
import type { ReactNode } from 'react'
import { beforeEach, expect, onTestFinished, test, vi } from 'vitest'

import { PasswordField, usePasswordField } from '../src/wpds'
import type { Meter } from '../src/wpds/strength'

const meter = vi.hoisted(() => ({ load: vi.fn() }))

vi.mock('../src/wpds/strength', async (importOriginal) => ({
	...(await importOriginal<typeof import('../src/wpds/strength')>()),
	loadMeter: meter.load,
}))

const generated24 = /^[A-Za-z0-9!@#$%^&*()]{24}$/

beforeEach(() => {
	meter.load.mockReset()
	meter.load.mockReturnValue(new Promise(() => {}))
})

interface FieldProps {
	length?: number
	generateFirst?: boolean
	readOnly?: boolean
	help?: ReactNode
	userInputs?: string[]
	labelPosition?: 'side' | 'top'
}

function Field({ length = 24, generateFirst, readOnly, help, userInputs = [], labelPosition }: FieldProps) {
	const password = usePasswordField({ length, userInputs })
	return (
		<>
			<PasswordField
				password={password}
				generateFirst={generateFirst}
				readOnly={readOnly}
				help={help}
				labelPosition={labelPosition}
			/>
			<p>{password.ready ? 'Ready to send' : 'Not ready to send'}</p>
		</>
	)
}

function expectInOrder(...nodes: Element[]) {
	for (let index = 1; index < nodes.length; index += 1) {
		const following = nodes[index - 1].compareDocumentPosition(nodes[index]) & Node.DOCUMENT_POSITION_FOLLOWING
		expect(following, `node ${index} follows node ${index - 1}`).not.toBe(0)
	}
}

function describedBy(field: Element): HTMLElement[] {
	const ids = field.getAttribute('aria-describedby')?.split(' ') ?? []
	return ids.map((id) => document.getElementById(id) as HTMLElement)
}

async function landMeter(scores: Record<string, number> = {}, otherwise = 4) {
	const scored = vi.fn<Meter>((password) => scores[password] ?? otherwise)
	let land: (loaded: Meter) => void = () => {}
	meter.load.mockReturnValue(
		new Promise<Meter>((resolve) => {
			land = resolve
		}),
	)
	return { scored, land: () => act(async () => land(scored)) }
}

function passwordField() {
	return screen.getByLabelText('Password') as HTMLInputElement
}

function generateButton() {
	return screen.getByRole('button', { name: 'Generate password' })
}

function confirmBox() {
	return screen.queryByRole('checkbox', { name: 'Confirm use of weak password' })
}

async function withWeakPassword(field: ReactNode) {
	const held = await landMeter({ password1234: 1 })
	render(field)
	await held.land()
	fireEvent.change(passwordField(), { target: { value: 'password1234' } })
	return [screen.getByText('Password'), screen.getByText('Confirm Password')]
}

function withStylesheet() {
	const sheet = document.createElement('style')
	sheet.textContent = readFileSync(resolve('src/wpds/style.css'), 'utf8')
	document.head.append(sheet)
	onTestFinished(() => sheet.remove())
}

function textSizes() {
	const texts = [
		describedBy(passwordField())[0],
		document.querySelector('.gopherium-setup__caps') as HTMLElement,
		screen.getByText('Confirm use of weak password'),
	]
	return texts.map((text) => getComputedStyle(text).fontSize)
}

function checkboxLine() {
	const checkbox = document.querySelector('.gopherium-setup__checkbox') as HTMLElement
	return getComputedStyle(checkbox).getPropertyValue('--_wp-ui-checkbox-control-label-line-height').trim()
}

test('stacks each label above its field as a godmin form field does, with labelPosition top', async () => {
	const labels = await withWeakPassword(
		<>
			<InputControl label="Email" />
			<Field labelPosition="top" generateFirst />
		</>,
	)

	const email = screen.getByText('Email')
	const emailRoot = email.parentElement as HTMLElement
	for (const label of labels) {
		const row = label.parentElement as HTMLElement
		expect([...label.classList], label.textContent ?? '').toEqual([...email.classList])
		expect(row).toHaveStyle({ flexDirection: 'column' })
		expect(row.getAttribute('style'), label.textContent ?? '').toBe(emailRoot.getAttribute('style'))
		expect([...emailRoot.classList]).toEqual(expect.arrayContaining([...row.classList]))
	}
	expectInOrder(labels[0], generateButton(), passwordField(), labels[1], confirmBox() as HTMLElement)
})

test('sizes the meter, Caps Lock line and weak password tick as its form does, with labelPosition top', async () => {
	withStylesheet()
	await withWeakPassword(
		<>
			<InputControl label="Email" />
			<Field labelPosition="top" />
		</>,
	)

	const formSize = getComputedStyle(screen.getByLabelText('Email')).fontSize
	expect({ sizes: textSizes(), line: checkboxLine() }).toEqual({ sizes: [formSize, formSize, formSize], line: '' })
})

test("sizes the meter, Caps Lock line and weak password tick at the installer's 14px by default", async () => {
	withStylesheet()
	await withWeakPassword(<Field />)

	expect({ sizes: textSizes(), line: checkboxLine() }).toEqual({
		sizes: ['14px', '14px', '14px'],
		line: expect.stringContaining('14px'),
	})
})

test("keeps the installer's rows without labelPosition, each label beside its field", async () => {
	const labels = await withWeakPassword(<Field />)

	for (const label of labels) {
		expect(label).toHaveClass('gopherium-setup__label')
		expect(label.parentElement).toHaveClass('gopherium-setup__row')
		expect(label.parentElement).not.toHaveAttribute('style')
	}
})

test("draws WordPress's Generate password button before the field, as Add User does", () => {
	render(<Field generateFirst />)

	expect(generateButton()).toHaveAttribute('type', 'button')
	expectInOrder(
		screen.getByText('Password'),
		generateButton(),
		passwordField(),
		screen.getByRole('button', { name: 'Hide password' }),
	)
})

test('draws no Generate password button without generateFirst, as the installer', () => {
	render(<Field />)

	expect(screen.queryByRole('button', { name: 'Generate password' })).toBeNull()
})

test('starts with a 24 character password shown in clear, as Add User asks', () => {
	render(<Field generateFirst length={24} />)

	expect(passwordField()).toHaveAttribute('type', 'text')
	expect(passwordField().value).toMatch(generated24)
})

test('puts a new password of the same length in on each press', async () => {
	render(<Field generateFirst length={24} />)
	const first = passwordField().value

	await userEvent.click(generateButton())

	const second = passwordField().value
	expect(second).toMatch(generated24)
	expect(second).not.toBe(first)

	await userEvent.click(generateButton())

	expect(passwordField().value).toMatch(generated24)
	expect(passwordField().value).not.toBe(second)
})

test('shows a new password in clear even after the field was hidden', async () => {
	render(<Field generateFirst />)
	await userEvent.click(screen.getByRole('button', { name: 'Hide password' }))
	expect(passwordField()).toHaveAttribute('type', 'password')

	await userEvent.click(generateButton())

	expect(passwordField()).toHaveAttribute('type', 'text')
	expect(screen.getByRole('button', { name: 'Hide password' })).toHaveTextContent(/^Hide$/)
})

test('scores a new password and drops the weak password row', async () => {
	const held = await landMeter({ password1234: 1 })
	render(<Field generateFirst />)
	await held.land()
	fireEvent.change(passwordField(), { target: { value: 'password1234' } })
	expect(confirmBox()).toBeInTheDocument()
	expect(screen.getByText('Not ready to send')).toBeInTheDocument()

	await userEvent.click(generateButton())

	expect(held.scored).toHaveBeenLastCalledWith(passwordField().value, expect.any(Array))
	expect(describedBy(passwordField())[0]).toHaveTextContent('Strong')
	expect(confirmBox()).toBeNull()
	expect(screen.getByText('Ready to send')).toBeInTheDocument()
})

test('keeps the password as it is while the field is read only', async () => {
	render(<Field generateFirst readOnly />)
	const kept = passwordField().value

	await userEvent.click(generateButton())

	expect(generateButton()).toHaveAttribute('aria-disabled', 'true')
	expect(passwordField().value).toBe(kept)
})

test('describes the field with the meter alone when it is given no help', () => {
	render(<Field generateFirst />)

	const described = describedBy(passwordField())
	expect(described).toHaveLength(1)
	expect(described[0]).toHaveAttribute('aria-live', 'polite')
	expect(screen.queryByText(/Important:/)).toBeNull()
})

test('describes the field with the meter, then the help it is given', async () => {
	const held = await landMeter()
	render(<Field help="Store it somewhere safe." />)

	await held.land()

	const [box, help] = describedBy(passwordField())
	expect(box).toHaveTextContent('Strong')
	expect(help).toHaveTextContent('Store it somewhere safe.')
	expect(passwordField()).toHaveAccessibleDescription('Strong Store it somewhere safe.')
})

test('is ready once it holds more than spaces and a weak password is confirmed', async () => {
	const held = await landMeter({ password1234: 1 })
	render(<Field />)
	await held.land()
	expect(screen.getByText('Ready to send')).toBeInTheDocument()

	fireEvent.change(passwordField(), { target: { value: '   ' } })
	expect(screen.getByText('Not ready to send')).toBeInTheDocument()

	fireEvent.change(passwordField(), { target: { value: 'password1234' } })
	expect(screen.getByText('Not ready to send')).toBeInTheDocument()

	await userEvent.click(confirmBox() as HTMLElement)

	expect(screen.getByText('Ready to send')).toBeInTheDocument()
})

test('scores against the words it is given', async () => {
	const held = await landMeter()
	render(<Field userInputs={['Maria Perez', 'maria@example.com']} />)
	await held.land()

	fireEvent.change(passwordField(), { target: { value: 'perezmaria12' } })

	const [password, words] = held.scored.mock.lastCall ?? []
	expect(password).toBe('perezmaria12')
	expect(words).toEqual(expect.arrayContaining(['Maria', 'Perez', 'maria', 'example']))
})
