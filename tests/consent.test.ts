import { describe, it, expect } from 'vitest'
import { canAppearOnBoards, hasShowcaseContent } from '../src/lib/consent'

describe('canAppearOnBoards', () => {
  it('excludes a user who has not opted in, even with data', () => {
    expect(canAppearOnBoards({ publicOptIn: false, hasData: true })).toBe(false)
  })
  it('includes a user who opted in and has data', () => {
    expect(canAppearOnBoards({ publicOptIn: true, hasData: true })).toBe(true)
  })
  it('excludes an opted-in user with no data so the board has no empty rows', () => {
    expect(canAppearOnBoards({ publicOptIn: true, hasData: false })).toBe(false)
  })
  it('excludes a user who is neither opted in nor has data', () => {
    expect(canAppearOnBoards({ publicOptIn: false, hasData: false })).toBe(false)
  })
})

describe('hasShowcaseContent', () => {
  it('accepts a selected live project without usage', () => {
    expect(hasShowcaseContent({
      usageRows: 0, projects: 1, mergedPrs: 0, activeRepos: 0, contributions: 0,
    })).toBe(true)
  })

  it('rejects an account with no usage, projects, or GitHub output', () => {
    expect(hasShowcaseContent({
      usageRows: 0, projects: 0, mergedPrs: 0, activeRepos: 0, contributions: 0,
    })).toBe(false)
  })
})
