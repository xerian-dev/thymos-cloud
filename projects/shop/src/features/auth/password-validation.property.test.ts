import { describe, it, expect } from "vitest"
import * as fc from "fast-check"
import { validatePassword } from "./password-validation"

/**
 * Feature: force-change-password, Property 1: Password rule validation correctness
 *
 * For any arbitrary string, the `validatePassword` function SHALL correctly report
 * each of the five password rules as satisfied if and only if the string contains
 * the corresponding character class (length ≥ 8, has uppercase, has lowercase,
 * has digit, has special character), and `allSatisfied` SHALL be true if and only
 * if all five individual rules are satisfied.
 *
 * Validates: Requirements 3.1, 3.2
 */

describe("Feature: force-change-password, Property 1: Password rule validation correctness", () => {
  it("each rule is satisfied iff the password contains the corresponding character class", () => {
    fc.assert(
      fc.property(fc.string(), (password) => {
        const result = validatePassword(password)

        // Verify min-length rule
        const minLengthRule = result.rules.find((r) => r.id === "min-length")
        expect(minLengthRule).toBeDefined()
        expect(minLengthRule!.satisfied).toBe(password.length >= 8)

        // Verify uppercase rule
        const uppercaseRule = result.rules.find((r) => r.id === "uppercase")
        expect(uppercaseRule).toBeDefined()
        expect(uppercaseRule!.satisfied).toBe(/[A-Z]/.test(password))

        // Verify lowercase rule
        const lowercaseRule = result.rules.find((r) => r.id === "lowercase")
        expect(lowercaseRule).toBeDefined()
        expect(lowercaseRule!.satisfied).toBe(/[a-z]/.test(password))

        // Verify digit rule
        const digitRule = result.rules.find((r) => r.id === "digit")
        expect(digitRule).toBeDefined()
        expect(digitRule!.satisfied).toBe(/\d/.test(password))

        // Verify special character rule
        const specialRule = result.rules.find((r) => r.id === "special")
        expect(specialRule).toBeDefined()
        expect(specialRule!.satisfied).toBe(/[^A-Za-z0-9]/.test(password))
      }),
      { numRuns: 500 }
    )
  })

  it("allSatisfied is true iff all five rules are satisfied", () => {
    fc.assert(
      fc.property(fc.string(), (password) => {
        const result = validatePassword(password)

        const expectedAllSatisfied =
          password.length >= 8 &&
          /[A-Z]/.test(password) &&
          /[a-z]/.test(password) &&
          /\d/.test(password) &&
          /[^A-Za-z0-9]/.test(password)

        expect(result.allSatisfied).toBe(expectedAllSatisfied)
      }),
      { numRuns: 500 }
    )
  })

  it("validates correctly with targeted character class strings", () => {
    // Use targeted arbitraries to ensure we cover strings that satisfy specific rules
    const uppercaseArb = fc.stringMatching(/^[A-Z]{0,5}$/)
    const lowercaseArb = fc.stringMatching(/^[a-z]{0,5}$/)
    const digitArb = fc.stringMatching(/^[0-9]{0,5}$/)
    const specialArb = fc.stringMatching(/^[!@#$%^&*]{0,5}$/)

    // Generate passwords by concatenating character class strings
    const compositeArb = fc
      .tuple(uppercaseArb, lowercaseArb, digitArb, specialArb)
      .map(([upper, lower, digit, special]) => upper + lower + digit + special)

    fc.assert(
      fc.property(compositeArb, (password) => {
        const result = validatePassword(password)

        expect(result.rules.find((r) => r.id === "min-length")!.satisfied).toBe(
          password.length >= 8
        )
        expect(result.rules.find((r) => r.id === "uppercase")!.satisfied).toBe(
          /[A-Z]/.test(password)
        )
        expect(result.rules.find((r) => r.id === "lowercase")!.satisfied).toBe(
          /[a-z]/.test(password)
        )
        expect(result.rules.find((r) => r.id === "digit")!.satisfied).toBe(
          /\d/.test(password)
        )
        expect(result.rules.find((r) => r.id === "special")!.satisfied).toBe(
          /[^A-Za-z0-9]/.test(password)
        )

        const expectedAllSatisfied =
          password.length >= 8 &&
          /[A-Z]/.test(password) &&
          /[a-z]/.test(password) &&
          /\d/.test(password) &&
          /[^A-Za-z0-9]/.test(password)

        expect(result.allSatisfied).toBe(expectedAllSatisfied)
      }),
      { numRuns: 500 }
    )
  })
})
