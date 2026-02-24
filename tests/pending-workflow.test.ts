/**
 * Pending Photo/Testimonial Workflow Tests
 *
 * Tests the full lifecycle of the pending status workflow:
 * - Draft businesses: photos/testimonials save as 'live' directly
 * - Published/paused businesses: new items get 'pending_add', deletions get 'pending_delete'
 * - On approval: pending_add → live, pending_delete → deleted from DB + storage
 * - On rejection: pending_add → deleted from DB + storage, pending_delete → reverted to live
 */

import { describe, it, expect } from 'vitest'

// ─── Status Determination Logic ──────────────────────────────────────

function isPublishedOrPaused(status: string): boolean {
  return status === 'published' || status === 'paused'
}

function determinePhotoStatus(businessStatus: string): 'live' | 'pending_add' {
  return isPublishedOrPaused(businessStatus) ? 'pending_add' : 'live'
}

function determineDeleteAction(
  businessStatus: string,
  photoStatus: string
): 'pending_delete' | 'immediate_delete' {
  if (isPublishedOrPaused(businessStatus) && photoStatus === 'live') {
    return 'pending_delete'
  }
  return 'immediate_delete'
}

type ApprovalActions = {
  promoteToLive: string[]
  deleteFromDbAndStorage: string[]
}

function getApprovalActions(
  items: { id: string; status: string; url?: string }[]
): ApprovalActions {
  return {
    promoteToLive: items.filter(i => i.status === 'pending_add').map(i => i.id),
    deleteFromDbAndStorage: items.filter(i => i.status === 'pending_delete').map(i => i.id),
  }
}

type RejectionActions = {
  deleteFromDbAndStorage: string[]
  revertToLive: string[]
}

function getRejectionActions(
  items: { id: string; status: string; url?: string }[]
): RejectionActions {
  return {
    deleteFromDbAndStorage: items.filter(i => i.status === 'pending_add').map(i => i.id),
    revertToLive: items.filter(i => i.status === 'pending_delete').map(i => i.id),
  }
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('Pending Workflow: Status Determination', () => {
  describe('isPublishedOrPaused', () => {
    it('returns true for published', () => {
      expect(isPublishedOrPaused('published')).toBe(true)
    })

    it('returns true for paused', () => {
      expect(isPublishedOrPaused('paused')).toBe(true)
    })

    it('returns false for draft', () => {
      expect(isPublishedOrPaused('draft')).toBe(false)
    })

    it('returns false for suspended', () => {
      expect(isPublishedOrPaused('suspended')).toBe(false)
    })
  })

  describe('determinePhotoStatus on add', () => {
    it('returns live for draft business', () => {
      expect(determinePhotoStatus('draft')).toBe('live')
    })

    it('returns pending_add for published business', () => {
      expect(determinePhotoStatus('published')).toBe('pending_add')
    })

    it('returns pending_add for paused business', () => {
      expect(determinePhotoStatus('paused')).toBe('pending_add')
    })

    it('returns live for suspended business', () => {
      expect(determinePhotoStatus('suspended')).toBe('live')
    })
  })

  describe('determineDeleteAction', () => {
    it('returns pending_delete for live photo on published business', () => {
      expect(determineDeleteAction('published', 'live')).toBe('pending_delete')
    })

    it('returns pending_delete for live photo on paused business', () => {
      expect(determineDeleteAction('paused', 'live')).toBe('pending_delete')
    })

    it('returns immediate_delete for live photo on draft business', () => {
      expect(determineDeleteAction('draft', 'live')).toBe('immediate_delete')
    })

    it('returns immediate_delete for pending_add photo on published business', () => {
      expect(determineDeleteAction('published', 'pending_add')).toBe('immediate_delete')
    })

    it('returns immediate_delete for pending_add photo on draft business', () => {
      expect(determineDeleteAction('draft', 'pending_add')).toBe('immediate_delete')
    })
  })
})

describe('Pending Workflow: Approval Actions', () => {
  it('promotes pending_add to live on approval', () => {
    const items = [
      { id: 'photo-1', status: 'live' },
      { id: 'photo-2', status: 'pending_add' },
      { id: 'photo-3', status: 'pending_add' },
    ]
    const actions = getApprovalActions(items)
    expect(actions.promoteToLive).toEqual(['photo-2', 'photo-3'])
  })

  it('deletes pending_delete items from DB and storage on approval', () => {
    const items = [
      { id: 'photo-1', status: 'live' },
      { id: 'photo-2', status: 'pending_delete' },
    ]
    const actions = getApprovalActions(items)
    expect(actions.deleteFromDbAndStorage).toEqual(['photo-2'])
  })

  it('handles mixed pending states on approval', () => {
    const items = [
      { id: 'photo-1', status: 'live' },
      { id: 'photo-2', status: 'pending_add' },
      { id: 'photo-3', status: 'pending_delete' },
      { id: 'photo-4', status: 'pending_add' },
    ]
    const actions = getApprovalActions(items)
    expect(actions.promoteToLive).toEqual(['photo-2', 'photo-4'])
    expect(actions.deleteFromDbAndStorage).toEqual(['photo-3'])
  })

  it('does nothing for all-live items', () => {
    const items = [
      { id: 'photo-1', status: 'live' },
      { id: 'photo-2', status: 'live' },
    ]
    const actions = getApprovalActions(items)
    expect(actions.promoteToLive).toEqual([])
    expect(actions.deleteFromDbAndStorage).toEqual([])
  })

  it('handles empty list', () => {
    const actions = getApprovalActions([])
    expect(actions.promoteToLive).toEqual([])
    expect(actions.deleteFromDbAndStorage).toEqual([])
  })
})

describe('Pending Workflow: Rejection Actions', () => {
  it('deletes pending_add items from DB and storage on rejection', () => {
    const items = [
      { id: 'photo-1', status: 'live' },
      { id: 'photo-2', status: 'pending_add' },
    ]
    const actions = getRejectionActions(items)
    expect(actions.deleteFromDbAndStorage).toEqual(['photo-2'])
  })

  it('reverts pending_delete to live on rejection', () => {
    const items = [
      { id: 'photo-1', status: 'live' },
      { id: 'photo-2', status: 'pending_delete' },
    ]
    const actions = getRejectionActions(items)
    expect(actions.revertToLive).toEqual(['photo-2'])
  })

  it('handles mixed pending states on rejection', () => {
    const items = [
      { id: 'photo-1', status: 'live' },
      { id: 'photo-2', status: 'pending_add' },
      { id: 'photo-3', status: 'pending_delete' },
    ]
    const actions = getRejectionActions(items)
    expect(actions.deleteFromDbAndStorage).toEqual(['photo-2'])
    expect(actions.revertToLive).toEqual(['photo-3'])
  })

  it('does nothing for all-live items', () => {
    const actions = getRejectionActions([
      { id: 'photo-1', status: 'live' },
    ])
    expect(actions.deleteFromDbAndStorage).toEqual([])
    expect(actions.revertToLive).toEqual([])
  })
})

describe('Pending Workflow: Full Lifecycle Scenarios', () => {
  it('draft business: add and delete are immediate', () => {
    const businessStatus = 'draft'

    // User adds a photo → status is 'live'
    const addStatus = determinePhotoStatus(businessStatus)
    expect(addStatus).toBe('live')

    // User deletes the photo → immediate delete
    const deleteAction = determineDeleteAction(businessStatus, addStatus)
    expect(deleteAction).toBe('immediate_delete')
  })

  it('published business: full add → approve lifecycle', () => {
    const businessStatus = 'published'

    // User adds a photo → status is 'pending_add'
    const addStatus = determinePhotoStatus(businessStatus)
    expect(addStatus).toBe('pending_add')

    // On approval: pending_add → promoted to live
    const items = [{ id: 'new-photo', status: addStatus }]
    const actions = getApprovalActions(items)
    expect(actions.promoteToLive).toContain('new-photo')
  })

  it('published business: full add → reject lifecycle', () => {
    const businessStatus = 'published'

    // User adds a photo → status is 'pending_add'
    const addStatus = determinePhotoStatus(businessStatus)
    expect(addStatus).toBe('pending_add')

    // On rejection: pending_add → deleted from DB + storage
    const items = [{ id: 'new-photo', status: addStatus }]
    const actions = getRejectionActions(items)
    expect(actions.deleteFromDbAndStorage).toContain('new-photo')
  })

  it('published business: full delete → approve lifecycle', () => {
    const businessStatus = 'published'

    // User deletes a live photo → pending_delete
    const deleteAction = determineDeleteAction(businessStatus, 'live')
    expect(deleteAction).toBe('pending_delete')

    // On approval: pending_delete → removed from DB + storage
    const items = [{ id: 'old-photo', status: 'pending_delete' }]
    const actions = getApprovalActions(items)
    expect(actions.deleteFromDbAndStorage).toContain('old-photo')
  })

  it('published business: full delete → reject lifecycle', () => {
    const businessStatus = 'published'

    // User deletes a live photo → pending_delete
    const deleteAction = determineDeleteAction(businessStatus, 'live')
    expect(deleteAction).toBe('pending_delete')

    // On rejection: pending_delete → reverted to live
    const items = [{ id: 'old-photo', status: 'pending_delete' }]
    const actions = getRejectionActions(items)
    expect(actions.revertToLive).toContain('old-photo')
  })

  it('published business: user adds photo then removes it before approval', () => {
    const businessStatus = 'published'

    // User adds a photo → pending_add
    const addStatus = determinePhotoStatus(businessStatus)
    expect(addStatus).toBe('pending_add')

    // User then deletes that pending_add photo → immediate delete (not pending_delete)
    const deleteAction = determineDeleteAction(businessStatus, 'pending_add')
    expect(deleteAction).toBe('immediate_delete')
  })

  it('complex scenario: multiple adds and deletes on published business', () => {
    const items = [
      { id: 'existing-1', status: 'live' },
      { id: 'existing-2', status: 'live' },
      { id: 'new-1', status: 'pending_add' },
      { id: 'new-2', status: 'pending_add' },
      { id: 'to-delete-1', status: 'pending_delete' },
    ]

    // Approval scenario
    const approvalActions = getApprovalActions(items)
    expect(approvalActions.promoteToLive).toHaveLength(2)
    expect(approvalActions.deleteFromDbAndStorage).toHaveLength(1)

    // After approval: existing-1, existing-2, new-1, new-2 are live
    // to-delete-1 is gone

    // Rejection scenario
    const rejectionActions = getRejectionActions(items)
    expect(rejectionActions.deleteFromDbAndStorage).toHaveLength(2)
    expect(rejectionActions.revertToLive).toHaveLength(1)

    // After rejection: existing-1, existing-2, to-delete-1 are live
    // new-1, new-2 are gone
  })
})
