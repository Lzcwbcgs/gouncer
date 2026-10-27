// SPDX-License-Identifier: Apache-2.0

import { readFileSync } from 'node:fs'
import { po } from 'gettext-parser'
import { expect, test } from 'vitest'

import { catalogFor } from '../src/languages'

const threeForms = 'nplurals=3; plural=((n == 1) ? 0 : ((n != 0 && n % 1000000 == 0) ? 1 : 2));'

const threeFrenchForms = 'nplurals=3; plural=(n == 0 || n == 1) ? 0 : n != 0 && n % 1000000 == 0 ? 1 : 2;'

test('declares the three CLDR plural forms in Spanish', async () => {
	const headers = po.parse(readFileSync('languages/es-ES.po', 'utf8')).headers

	expect(headers['Plural-Forms']).toBe(threeForms)
	expect((await catalogFor('es-ES'))?.['']).toMatchObject({ 'plural-forms': threeForms })
})

test('declares the three CLDR plural forms in French, zero taking the one form', async () => {
	const headers = po.parse(readFileSync('languages/fr-FR.po', 'utf8')).headers

	expect(headers['Plural-Forms']).toBe(threeFrenchForms)
	expect((await catalogFor('fr-FR'))?.['']).toMatchObject({ lang: 'fr-FR', 'plural-forms': threeFrenchForms })
})

test.each(['es-ES', 'fr-FR'])('fills every form of every counted string in %s', async (locale) => {
	const template = po.parse(readFileSync('languages/gopherium-react-auth.pot', 'utf8')).translations
	const counted = Object.entries(template).flatMap(([context, held]) =>
		Object.values(held)
			.filter((entry) => entry.msgid_plural !== undefined)
			.map((entry) => (context === '' ? entry.msgid : `${context}\u0004${entry.msgid}`)),
	)
	const catalog = await catalogFor(locale)

	const unfilled = counted.filter((key) => {
		const forms = catalog?.[key]
		return !Array.isArray(forms) || forms.length !== 3 || forms.some((form) => form === '')
	})

	expect(counted.length).toBeGreaterThan(0)
	expect(unfilled).toEqual([])
})
