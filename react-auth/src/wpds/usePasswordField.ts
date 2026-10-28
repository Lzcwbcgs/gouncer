// SPDX-License-Identifier: Apache-2.0

import { useEffect, useEffectEvent, useRef, useState } from 'react'

import { generatePassword } from './password.js'
import { disallowedWords, levelOf, loadMeter } from './strength.js'
import type { Meter, Tone } from './strength.js'

/** What the meter knows of the password: nothing yet, an empty field, or a score from -1 to 4. */
export type Strength = number | 'empty' | undefined

/** The password a PasswordField draws, what the meter knows of it, and the setters the field calls. */
export interface PasswordFieldState {
	value: string
	strength: Strength
	confirmed: boolean
	masked: boolean
	ready: boolean
	change: (value: string) => void
	generate: () => void
	confirm: (confirmed: boolean) => void
	mask: (masked: boolean) => void
}

/**
 * Returns what the meter knows of a password at the moment it is scored.
 * @param password - The password as typed.
 * @param meter - The meter, once it has landed.
 * @param words - Reads the words the meter treats as easy to guess.
 * @returns The strength, -1 while the meter has not landed.
 */
function strengthOf(password: string, meter: Meter | undefined, words: () => string[]): Strength {
	if (password.trim() === '') {
		return 'empty'
	}
	return meter === undefined ? -1 : meter(password, words())
}

/**
 * Returns the meter's tone for a strength.
 * @param strength - What the meter knows of the password.
 * @returns The tone, or undefined while nothing was scored or the field is empty.
 */
export function toneOf(strength: Strength): Tone | undefined {
	return typeof strength === 'number' ? levelOf(strength).tone : undefined
}

/**
 * Reports whether a password this strong needs its use confirmed.
 * @param strength - What the meter knows of the password.
 * @returns True for the very weak, weak and unknown levels.
 */
export function needsConfirmation(strength: Strength): boolean {
	const tone = toneOf(strength)
	return tone === 'short' || tone === 'bad'
}

/**
 * Reports whether a password may be sent, the meter's confirmation included.
 * @param value - The password as typed.
 * @param strength - What the meter knows of it.
 * @param confirmed - Whether its weak use is confirmed.
 * @returns True once it holds more than spaces and a weak password is confirmed.
 */
function isReady(value: string, strength: Strength, confirmed: boolean): boolean {
	return value.trim() !== '' && (confirmed || !needsConfirmation(strength))
}

/**
 * Holds a password, scores it when the meter lands and on each change, and keeps its mask and weak use confirmation.
 * @param length - The length of every password it generates, the one the field starts with included.
 * @param userInputs - The values the meter treats as easy to guess, such as the name and email typed beside it.
 * @returns The password, what the meter knows of it, and its setters.
 */
export function usePasswordField({
	length,
	userInputs,
}: {
	length: number
	userInputs: string[]
}): PasswordFieldState {
	const [value, setValue] = useState(() => generatePassword(length))
	const [strength, setStrength] = useState<Strength>(undefined)
	const [confirmed, setConfirmed] = useState(false)
	const [masked, setMasked] = useState(false)
	const meter = useRef<Meter>(undefined)
	const words = () => disallowedWords([document.title, location.href, ...userInputs])
	const landed = useEffectEvent((loaded: Meter) => {
		meter.current = loaded
		setStrength(strengthOf(value, loaded, words))
	})
	useEffect(() => {
		loadMeter().then(
			(loaded) => landed(loaded),
			() => undefined,
		)
	}, [])
	const change = (next: string) => {
		setValue(next)
		setStrength(strengthOf(next, meter.current, words))
		if (next.trim() === '') {
			setConfirmed(false)
		}
	}
	return {
		value,
		strength,
		confirmed,
		masked,
		ready: isReady(value, strength, confirmed),
		change,
		generate: () => {
			change(generatePassword(length))
			setMasked(false)
		},
		confirm: setConfirmed,
		mask: setMasked,
	}
}
