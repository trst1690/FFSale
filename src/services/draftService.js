class DraftService {
  constructor() {
    this.activeDrafts = new Map();
  }
  
  startDraft(contestId, entries, playerBoard) {
    const draftState = {
      contestId,
      playerBoard,
      entries,
      currentTurn: 0,
      draftOrder: [0,1,2,3,4,4,3,2,1,0,0,1,2,3,4,4,3,2,1,0,0,1,2,3,4],
      picks: [],
      teams: entries.map(entry => ({
        entryId: entry.id,
        userId: entry.userId,
        username: entry.username,
        color: entry.teamColor,
        roster: {
          QB: null,
          RB: null,
          WR: null,
          TE: null,
          FLEX: null
        },
        budget: 15,
        bonus: 0
      })),
      startTime: new Date(),
      status: 'active'
    };
    
    this.activeDrafts.set(contestId, draftState);
    return draftState;
  }
  
  getDraft(contestId) {
    return this.activeDrafts.get(contestId);
  }
  
  makePick(contestId, userId, pick) {
    const draft = this.activeDrafts.get(contestId);
    if (!draft) {
      throw new Error('Draft not found');
    }
    
    const currentTeamIndex = draft.draftOrder[draft.currentTurn];
    const currentTeam = draft.teams[currentTeamIndex];
    
    // Validate it's the user's turn
    if (currentTeam.userId !== userId) {
      throw new Error('Not your turn');
    }
    
    // Update draft state
    draft.picks.push({
      ...pick,
      teamIndex: currentTeamIndex,
      pickNumber: draft.currentTurn
    });
    
    // Update team roster
    currentTeam.roster[pick.rosterSlot] = pick.player;
    currentTeam.budget -= pick.player.price;
    
    // Move to next turn
    draft.currentTurn++;
    
    // Check if draft is complete
    if (draft.currentTurn >= draft.draftOrder.length) {
      draft.status = 'completed';
      this.completeDraft(contestId);
    }
    
    return draft;
  }
  
  completeDraft(contestId) {
    const draft = this.activeDrafts.get(contestId);
    if (!draft) return;
    
    // Save final rosters to contest entries
    // This would update the database in a real app
    console.log(`Draft completed for contest ${contestId}`);
    
    // Clean up
    this.activeDrafts.delete(contestId);
  }
  
  getActiveDrafts() {
    return Array.from(this.activeDrafts.values());
  }
}

module.exports = new DraftService();