// frontend/src/components/Draft/DraftScreen.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import socketService from '../../services/socket';
import './DraftScreen.css';

// Utility function to generate a basic player board if needed
const generateBasicPlayerBoard = (type = 'cash') => {
  const positions = ['QB', 'RB', 'WR', 'TE'];
  const teams = ['KC', 'BUF', 'CIN', 'PHI', 'SF', 'DAL', 'MIA', 'BAL'];
  const names = {
    QB: ['Mahomes', 'Allen', 'Burrow', 'Hurts'],
    RB: ['McCaffrey', 'Ekeler', 'Barkley', 'Taylor'],
    WR: ['Hill', 'Jefferson', 'Chase', 'Diggs'],
    TE: ['Kelce', 'Andrews', 'Hockenson', 'Kittle']
  };
  
  const board = [];
  
  // Create price rows $5 to $1
  for (let price = 5; price >= 1; price--) {
    const row = [];
    for (let i = 0; i < 4; i++) {
      const position = positions[i];
      const playerIndex = 5 - price;
      row.push({
        name: names[position][playerIndex % names[position].length],
        position: position,
        originalPosition: position,
        team: teams[Math.floor(Math.random() * teams.length)],
        price: price,
        drafted: false,
        id: `${position}-${price}-${i}`
      });
    }
    board.push(row);
  }
  
  return board;
};

const DraftScreen = ({ user, showToast }) => {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const mountedRef = useRef(true);
  const hasJoinedDraftRef = useRef(false);
  const isPickingRef = useRef(false);
  const autoPickTimeoutRef = useRef(null);

  // Draft state
  const [draftState, setDraftState] = useState({
    status: 'loading', // loading, waiting, countdown, active, completed
    playerBoard: null,
    currentTurn: 0,
    draftOrder: [],
    picks: [],
    timeRemaining: 30,
    currentDrafter: null,
    currentDrafterPosition: null,
    userDraftPosition: null,
    users: [],
    countdownTime: null
  });

  // Contest data
  const [contestData, setContestData] = useState(null);
  const [entryId, setEntryId] = useState(null);
  const [contestType, setContestType] = useState('cash');

  // Local state
  const [myRoster, setMyRoster] = useState({
    QB: null,
    RB: null,
    WR: null,
    TE: null,
    FLEX: null
  });
  const [budget, setBudget] = useState(15);
  const [bonus, setBonus] = useState(0);
  const [teams, setTeams] = useState([]);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [currentViewTeam, setCurrentViewTeam] = useState(0);
  
  // Auto-pick and suggestions
  const [autoPickEnabled, setAutoPickEnabled] = useState(true);
  const [showAutoPickSuggestion, setShowAutoPickSuggestion] = useState(true);
  const [autoPickSuggestion, setAutoPickSuggestion] = useState(null);

  // Get draft data from various sources
  const getDraftData = useCallback(() => {
    console.log('=== GETTING DRAFT DATA ===');
    console.log('Room ID from URL:', roomId);
    
    // Try to get from sessionStorage first
    const storedDraft = sessionStorage.getItem('currentDraft');
    const storedContest = sessionStorage.getItem('currentContest');
    const storedEntry = sessionStorage.getItem('currentEntry');
    
    console.log('Stored Draft:', storedDraft ? 'Found' : 'Not found');
    console.log('Stored Contest:', storedContest ? 'Found' : 'Not found');
    console.log('Stored Entry:', storedEntry ? 'Found' : 'Not found');
    
    let draftData = null;
    let contestDataParsed = null;
    let entryData = null;
    
    try {
      draftData = storedDraft ? JSON.parse(storedDraft) : null;
      contestDataParsed = storedContest ? JSON.parse(storedContest) : null;
      entryData = storedEntry ? JSON.parse(storedEntry) : null;
    } catch (e) {
      console.error('Error parsing stored data:', e);
    }
    
    // Combine data from all sources, prioritizing draft data
    const combinedData = {
      ...contestDataParsed,
      ...entryData,
      ...draftData,
      roomId: roomId || draftData?.roomId || contestDataParsed?.roomId || entryData?.roomId
    };
    
    console.log('Combined draft data:', combinedData);
    
    return combinedData;
  }, [roomId]);

  // Initialize draft
  useEffect(() => {
    console.log('=== DRAFT SCREEN MOUNTED ===');
    console.log('Room ID from URL:', roomId);
    console.log('User:', user);
    console.log('Socket Connected:', socketService.isConnected());
    
    if (!user || !roomId) {
      console.error('Missing user or roomId');
      showToast('Missing required data', 'error');
      navigate('/lobby');
      return;
    }

    const data = getDraftData();
    console.log('Retrieved draft data:', data);
    
    // Set contest data
    setContestData(data);
    setEntryId(data.entryId);
    setContestType(data.contestType || 'cash');
    
    // Set player board if available
    if (data.playerBoard) {
      setDraftState(prev => ({ ...prev, playerBoard: data.playerBoard }));
    } else {
      // Generate a basic board if none provided
      console.log('No player board found, generating basic board');
      setDraftState(prev => ({ 
        ...prev, 
        playerBoard: generateBasicPlayerBoard(data.contestType) 
      }));
    }

    // Initialize socket connection
    initializeSocket(data);

    return () => {
      console.log('=== DRAFT SCREEN UNMOUNTING ===');
      mountedRef.current = false;
      
      if (autoPickTimeoutRef.current) {
        clearTimeout(autoPickTimeoutRef.current);
      }
      
      // Leave draft but keep socket connected
      if (hasJoinedDraftRef.current) {
        console.log('Leaving draft room but keeping socket connected');
        socketService.emit('leave-draft', {
          contestId: data.contestId,
          roomId: roomId
        });
      }
      
      // Cleanup listeners
      cleanupSocketListeners();
    };
  }, [roomId, user, navigate, showToast, getDraftData]);

  // Initialize socket connection
  const initializeSocket = async (data) => {
    console.log('Initializing socket connection...');
    
    // Ensure socket is connected
    const token = localStorage.getItem('token');
    if (!socketService.isConnected()) {
      console.log('Socket not connected, connecting now...');
      try {
        await socketService.connect(token);
      } catch (error) {
        console.error('Failed to connect socket:', error);
        showToast('Failed to connect to server', 'error');
        return;
      }
    }
    
    // Set up listeners first
    setupSocketListeners();
    
    // Then join the draft
    setTimeout(() => {
      joinDraftRoom(data);
    }, 500);
  };

  // Join draft room
  const joinDraftRoom = (data) => {
    if (hasJoinedDraftRef.current) {
      console.log('Already joined draft, skipping...');
      return;
    }
    
    hasJoinedDraftRef.current = true;
    
    console.log('Joining draft room with:', {
      contestId: data.contestId,
      entryId: data.entryId,
      roomId: roomId
    });
    
    socketService.emit('join-draft', {
      contestId: data.contestId,
      entryId: data.entryId
    });
  };

  // Cleanup socket listeners
  const cleanupSocketListeners = () => {
    const events = [
      'draft-state',
      'draft-state-update',
      'room-update',
      'countdown-started',
      'countdown-update',
      'draft-started',
      'timer-update',
      'pick-made',
      'turn-skipped',
      'draft-completed',
      'error',
      'user-joined',
      'user-disconnected'
    ];
    
    events.forEach(event => {
      socketService.off(event);
    });
  };

  // Set up socket listeners
  const setupSocketListeners = () => {
    console.log('Setting up socket listeners...');
    
    socketService.on('draft-state-update', (state) => {
      console.log('Received draft state update:', state);
      handleDraftStateUpdate(state);
    });

    socketService.on('room-update', (data) => {
      console.log('Room update:', data);
      if (data.players) {
        const connectedPlayers = data.players.filter(p => p.connected);
        setDraftState(prev => ({
          ...prev,
          users: data.players
        }));
      }
    });

    socketService.on('countdown-started', (data) => {
      console.log('Countdown started!', data);
      setDraftState(prev => ({
        ...prev,
        status: 'countdown',
        countdownTime: data.countdownTime,
        users: data.users || prev.users,
        draftOrder: data.draftOrder || prev.draftOrder
      }));
      
      if (data.users && user) {
        const userInfo = data.users.find(u => u.userId === user.id);
        if (userInfo) {
          setDraftState(prev => ({
            ...prev,
            userDraftPosition: userInfo.position
          }));
          console.log('Set user draft position from countdown:', userInfo.position);
        }
      }
      
      initializeTeamsFromUsers(data.users || []);
    });

    socketService.on('countdown-update', (data) => {
      setDraftState(prev => ({
        ...prev,
        countdownTime: data.countdownTime
      }));
    });

    socketService.on('draft-started', (data) => {
      console.log('Draft started!', data);
      setDraftState(prev => ({
        ...prev,
        status: 'active',
        currentTurn: 0,
        timeRemaining: 30,
        draftOrder: data.draftOrder || prev.draftOrder,
        playerBoard: data.playerBoard || prev.playerBoard,
        users: data.users || prev.users
      }));
      
      if (showToast) {
        showToast('Draft has started!', 'success');
      }
      
      if (data.users) {
        initializeTeamsFromUsers(data.users);
      }
    });

    socketService.on('timer-update', (data) => {
      const time = typeof data === 'number' ? data : data.timeRemaining;
      setDraftState(prev => ({
        ...prev,
        timeRemaining: time
      }));
    });

    socketService.on('pick-made', (data) => {
      console.log('Pick made:', data);
      handlePickMade(data);
    });

    socketService.on('turn-skipped', (data) => {
      console.log('Turn skipped:', data);
      setDraftState(prev => ({
        ...prev,
        currentTurn: data.currentTurn,
        timeRemaining: 30
      }));
      
      isPickingRef.current = false;
      
      if (showToast && data.message) {
        showToast(data.message, 'warning');
      }
    });

    socketService.on('draft-completed', (data) => {
      console.log('Draft completed!', data);
      setDraftState(prev => ({
        ...prev,
        status: 'completed'
      }));
      handleDraftComplete(data);
    });

    socketService.on('error', (error) => {
      console.error('Socket error:', error);
      if (showToast) {
        showToast(error.message || 'An error occurred', 'error');
      }
      isPickingRef.current = false;
    });

    socketService.on('user-joined', (data) => {
      console.log('User joined:', data);
      if (showToast) {
        showToast(`${data.username} joined the draft`, 'info');
      }
    });

    socketService.on('user-disconnected', (data) => {
      console.log('User disconnected:', data);
      if (showToast) {
        showToast(`${data.username} disconnected`, 'warning');
      }
    });
  };

  // Handle draft state update
  const handleDraftStateUpdate = (state) => {
    console.log('Processing draft state update...');
    
    setDraftState(prev => ({
      ...prev,
      status: state.status || prev.status,
      currentTurn: state.currentTurn ?? prev.currentTurn,
      draftOrder: state.draftOrder || prev.draftOrder,
      timeRemaining: state.timeRemaining ?? prev.timeRemaining,
      currentDrafter: state.currentDrafter || prev.currentDrafter,
      currentDrafterPosition: state.currentDrafterPosition ?? prev.currentDrafterPosition,
      userDraftPosition: state.userDraftPosition ?? prev.userDraftPosition,
      users: state.users || prev.users,
      playerBoard: state.playerBoard || prev.playerBoard,
      picks: state.picks || prev.picks,
      totalPlayers: state.totalPlayers || 5,
      connectedPlayers: state.connectedPlayers || state.users?.length || 0
    }));
    
    // Initialize teams if we have users
    if (state.users && state.users.length > 0) {
      initializeTeamsFromUsers(state.users);
    }
    
    // Process any existing picks
    if (state.picks && state.picks.length > 0) {
      state.picks.forEach(pick => {
        applyPickToBoard(pick);
      });
    }
    
    // Update turn status
    if (state.userDraftPosition !== undefined && state.currentDrafterPosition !== undefined) {
      setIsMyTurn(state.userDraftPosition === state.currentDrafterPosition);
    }
  };

  // Initialize teams from users
  const initializeTeamsFromUsers = (users) => {
    console.log('Initializing teams from users:', users);
    
    const teamColors = ['Green', 'Red', 'Blue', 'Yellow', 'Purple'];
    
    const newTeams = users.map((user, index) => {
      const position = user.position ?? user.draftPosition ?? index;
      return {
        name: user.username,
        color: user.teamColor || teamColors[position],
        userId: user.userId,
        draftPosition: position,
        isHuman: !user.isBot,
        roster: user.roster || {
          QB: null,
          RB: null,
          WR: null,
          TE: null,
          FLEX: null
        },
        players: [],
        budget: user.budget ?? 15,
        bonus: user.bonus || 0
      };
    });
    
    setTeams(newTeams);
    
    // Set user's team index
    const userIndex = newTeams.findIndex(t => t.userId === user?.id);
    if (userIndex >= 0) {
      setCurrentViewTeam(userIndex);
    }
  };

  // Handle pick made
  const handlePickMade = (data) => {
    const { pick, currentTurn, nextDrafter, message } = data;
    
    // Apply pick to board
    applyPickToBoard(pick);
    
    // Update team roster
    updateTeamRoster(pick);
    
    // Update state
    setDraftState(prev => ({
      ...prev,
      currentTurn: currentTurn,
      timeRemaining: 30,
      currentDrafterPosition: nextDrafter
    }));
    
    // Update my turn status
    if (draftState.userDraftPosition !== undefined && nextDrafter !== undefined) {
      setIsMyTurn(draftState.userDraftPosition === nextDrafter);
    }
    
    isPickingRef.current = false;
    
    if (showToast && message) {
      showToast(message, 'info');
    }
  };

  // Apply pick to board
  const applyPickToBoard = (pick) => {
    const { row, col, draftedBy } = pick;
    
    setDraftState(prev => {
      if (!prev.playerBoard) return prev;
      
      const newBoard = prev.playerBoard.map(r => [...r]);
      if (newBoard[row] && newBoard[row][col]) {
        newBoard[row][col] = {
          ...newBoard[row][col],
          drafted: true,
          draftedBy: draftedBy ?? pick.draftPosition
        };
      }
      
      return {
        ...prev,
        playerBoard: newBoard
      };
    });
  };

  // Update team roster
  const updateTeamRoster = (pick) => {
    const { userId, player, rosterSlot } = pick;
    
    setTeams(prevTeams => {
      const newTeams = [...prevTeams];
      const teamIndex = newTeams.findIndex(t => t.userId === userId);
      
      if (teamIndex >= 0) {
        const team = newTeams[teamIndex];
        team.roster[rosterSlot] = player;
        team.players.push({ ...player, rosterSlot });
        team.budget = Math.max(0, team.budget - player.price);
        
        // Update user's budget if it's their team
        if (userId === user?.id) {
          setBudget(team.budget);
          setMyRoster(team.roster);
        }
        
        // Calculate kingpin bonus if applicable
        if (contestType === 'kingpin' || contestType === 'firesale') {
          const bonusEarned = calculateKingpinBonus(team, player);
          team.bonus += bonusEarned;
          
          if (userId === user?.id) {
            setBonus(prev => prev + bonusEarned);
          }
        }
      }
      
      return newTeams;
    });
  };

  // Calculate kingpin bonus
  const calculateKingpinBonus = (team, newPlayer) => {
    let bonusAdded = 0;
    const roster = team.roster || {};
    const players = Object.values(roster).filter(p => p);
    
    // Check for duplicate player bonus
    const duplicates = players.filter(p => 
      p.name === newPlayer.name && p.team === newPlayer.team
    );
    if (duplicates.length === 1) {
      bonusAdded++;
    }
    
    // Check for QB + pass catcher stack
    const teamQB = players.find(p => 
      (p.position === 'QB' || p.originalPosition === 'QB') && 
      p.team === newPlayer.team
    );
    const isPassCatcher = ['WR', 'TE'].includes(newPlayer.position) || 
      ['WR', 'TE'].includes(newPlayer.originalPosition);
    
    if (teamQB && isPassCatcher) {
      bonusAdded++;
    }
    
    // Or if new player is QB, check for existing pass catchers
    const isQB = newPlayer.position === 'QB' || newPlayer.originalPosition === 'QB';
    if (isQB) {
      const hasPassCatcher = players.some(p => 
        p.team === newPlayer.team &&
        (['WR', 'TE'].includes(p.position) || 
         ['WR', 'TE'].includes(p.originalPosition))
      );
      if (hasPassCatcher) {
        bonusAdded++;
      }
    }
    
    return bonusAdded;
  };

  // Handle draft complete
  const handleDraftComplete = (data) => {
    console.log('Draft completed, showing results...');
    
    if (data?.results) {
      // Update teams with final results
      data.results.forEach(result => {
        const teamIndex = teams.findIndex(t => t.userId === result.userId);
        if (teamIndex >= 0) {
          teams[teamIndex].roster = result.roster;
          teams[teamIndex].budget = result.budget;
          teams[teamIndex].bonus = result.bonus || 0;
        }
      });
    }
    
    setShowResults(true);
    
    // Save draft results if it's user's team
    const userTeam = teams.find(t => t.userId === user?.id);
    if (userTeam && entryId) {
      saveDraftResults(userTeam);
    }
  };

  // Save draft results
  const saveDraftResults = async (userTeam) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        '/api/drafts/complete',
        {
          entryId: entryId,
          roster: userTeam.roster,
          totalSpent: 15 - userTeam.budget
        },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      console.log('Draft results saved:', response.data);
    } catch (error) {
      console.error('Error saving draft results:', error);
    }
  };

  // Check if it's my turn
  useEffect(() => {
    const myTurn = draftState.status === 'active' && 
                   draftState.userDraftPosition !== null && 
                   draftState.userDraftPosition === draftState.currentDrafterPosition;
    
    setIsMyTurn(myTurn);
    
    // Handle auto-pick timer
    if (myTurn && draftState.timeRemaining <= 0 && autoPickEnabled) {
      handleAutoPick();
    }
  }, [draftState.status, draftState.userDraftPosition, draftState.currentDrafterPosition, 
      draftState.timeRemaining, autoPickEnabled]);

  // Calculate auto-pick suggestion
  useEffect(() => {
    if (isMyTurn && draftState.status === 'active' && showAutoPickSuggestion) {
      const suggestion = calculateBestPick();
      setAutoPickSuggestion(suggestion);
    } else {
      setAutoPickSuggestion(null);
    }
  }, [isMyTurn, draftState.status, teams, draftState.playerBoard, showAutoPickSuggestion]);

  // Get available slots for a player
  const getAvailableSlots = (team, player) => {
    const playerPos = player.originalPosition || player.position;
    const availableSlots = [];
    const roster = team.roster || {};

    // Check if the specific position slot is open
    if (!roster[playerPos]) {
      availableSlots.push(playerPos);
    }

    // Check if FLEX slot is available (only for RB, WR, TE)
    if (!roster.FLEX && ['RB', 'WR', 'TE'].includes(playerPos)) {
      availableSlots.push('FLEX');
    }

    return availableSlots;
  };

  // Calculate best pick
  const calculateBestPick = () => {
    const myTeam = teams.find(t => t.userId === user?.id);
    if (!myTeam || !draftState.playerBoard) return null;

    let bestPick = null;
    let bestScore = -1;
    const totalBudget = Math.max(0, myTeam.budget) + myTeam.bonus;

    // Get needed positions
    const neededPositions = [];
    if (!myTeam.roster.QB) neededPositions.push('QB');
    if (!myTeam.roster.RB) neededPositions.push('RB');
    if (!myTeam.roster.WR) neededPositions.push('WR');
    if (!myTeam.roster.TE) neededPositions.push('TE');

    draftState.playerBoard.forEach((row, rowIndex) => {
      row.forEach((player, colIndex) => {
        if (player.drafted || player.price > totalBudget) return;

        const availableSlots = getAvailableSlots(myTeam, player);
        if (availableSlots.length === 0) return;

        // Calculate score
        let score = player.price * 10; // Base score

        // Bonus for filling needed positions
        const playerPos = player.originalPosition || player.position;
        if (neededPositions.includes(playerPos)) {
          score += 50;
        }

        // Bonus for completing roster
        const filledSlots = Object.values(myTeam.roster).filter(p => p).length;
        if (filledSlots < 4) {
          score += 30;
        }

        // Penalty if it leaves too little budget
        const slotsRemaining = 5 - filledSlots - 1;
        const budgetAfter = totalBudget - player.price;
        if (slotsRemaining > 0 && budgetAfter < slotsRemaining) {
          score -= 50;
        }

        // Kingpin bonus consideration
        if (contestType === 'kingpin' || contestType === 'firesale') {
          const potentialBonus = calculateKingpinBonus(myTeam, player);
          score += potentialBonus * 20;
        }

        if (score > bestScore) {
          bestScore = score;
          bestPick = {
            row: rowIndex,
            col: colIndex,
            player,
            slot: availableSlots[0],
            score
          };
        }
      });
    });

    return bestPick;
  };

  // Handle auto-pick
  const handleAutoPick = () => {
    if (!autoPickEnabled || isPickingRef.current) return;
    
    const bestPick = calculateBestPick();
    if (bestPick) {
      console.log('Auto-picking:', bestPick.player.name);
      selectPlayer(bestPick.row, bestPick.col);
    } else {
      console.log('No valid picks available, skipping turn');
      skipTurn();
    }
  };

  // Select player
  const selectPlayer = (row, col) => {
    if (isPickingRef.current) {
      console.log('Already processing a pick');
      return;
    }
    
    if (!isMyTurn) {
      showToast("It's not your turn!", 'error');
      return;
    }
    
    const player = draftState.playerBoard[row][col];
    if (player.drafted) {
      showToast('This player has already been drafted!', 'error');
      return;
    }
    
    const myTeam = teams.find(t => t.userId === user?.id);
    if (!myTeam) return;
    
    const availableSlots = getAvailableSlots(myTeam, player);
    if (availableSlots.length === 0) {
      showToast(`No available slots for ${player.name}!`, 'error');
      return;
    }
    
    const totalBudget = Math.max(0, myTeam.budget) + myTeam.bonus;
    if (player.price > totalBudget) {
      showToast(`Not enough budget! You have $${totalBudget}`, 'error');
      return;
    }
    
    isPickingRef.current = true;
    
    const rosterSlot = availableSlots[0];
    
    console.log(`Making pick: ${player.name} to ${rosterSlot} slot`);
    
    socketService.emit('make-pick', {
      row,
      col,
      player,
      rosterSlot
    });
  };

  // Skip turn
  const skipTurn = () => {
    if (!isMyTurn || isPickingRef.current) return;
    
    isPickingRef.current = true;
    socketService.emit('skip-turn', {
      reason: 'no_valid_picks'
    });
  };

  // Render loading state
  if (draftState.status === 'loading') {
    return (
      <div className="draft-container">
        <div className="loading-screen">
          <div className="loading-spinner"></div>
          <p>Loading draft...</p>
        </div>
      </div>
    );
  }

  // Render waiting state
  if (draftState.status === 'waiting') {
    return (
      <div className="draft-container">
        <div className="waiting-screen">
          <h1>Waiting for Draft to Start</h1>
          <p>Connected Players: {draftState.connectedPlayers || 0} / {draftState.totalPlayers || 5}</p>
          
          <div className="connected-users">
            {draftState.users.map((user, index) => (
              <div key={user.userId} className="user-status">
                <span>{user.username}</span>
                <span className={user.connected ? 'connected' : 'disconnected'}>
                  {user.connected ? '✓' : '✗'}
                </span>
              </div>
            ))}
          </div>
          
          <button onClick={() => navigate('/lobby')} className="back-button">
            Back to Lobby
          </button>
        </div>
      </div>
    );
  }

  // Render countdown state
  if (draftState.status === 'countdown') {
    return (
      <div className="draft-container">
        <div className="countdown-screen">
          <h1>Draft Starting Soon!</h1>
          <div className="countdown-timer">
            <div className="countdown-number">{draftState.countdownTime}</div>
          </div>
          <p>Get ready to draft!</p>
          
          <div className="draft-order-preview">
            <h3>Draft Order:</h3>
            <div className="users-list">
              {teams.map((team, index) => (
                <div key={team.userId} className={`user-item ${team.userId === user?.id ? 'current-user' : ''}`}>
                  <span className="position">{index + 1}.</span>
                  <span className={`username team-${team.color?.toLowerCase()}`}>
                    {team.name} {team.userId === user?.id && '(You)'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Render results state
  if (showResults || draftState.status === 'completed') {
    return (
      <div className="draft-container">
        <div className="results-screen">
          <h1>Draft Complete!</h1>
          
          <div className="team-viewer">
            <div className="team-navigation">
              <button 
                onClick={() => setCurrentViewTeam(prev => prev > 0 ? prev - 1 : teams.length - 1)}
                disabled={teams.length <= 1}
              >
                ←
              </button>
              <h2 className={`team-name team-${teams[currentViewTeam]?.color?.toLowerCase()}`}>
                {teams[currentViewTeam]?.name}
                {teams[currentViewTeam]?.userId === user?.id && ' (Your Team)'}
              </h2>
              <button 
                onClick={() => setCurrentViewTeam(prev => prev < teams.length - 1 ? prev + 1 : 0)}
                disabled={teams.length <= 1}
              >
                →
              </button>
            </div>
            
            <div className="roster-display">
              {['QB', 'RB', 'WR', 'TE', 'FLEX'].map(slot => {
                const player = teams[currentViewTeam]?.roster[slot];
                return (
                  <div key={slot} className="roster-slot">
                    <span className="slot-label">{slot}:</span>
                    {player ? (
                      <div className="player-info">
                        <span className="player-name">{player.name}</span>
                        <span className="player-details">
                          {player.team} - ${player.price}
                        </span>
                      </div>
                    ) : (
                      <span className="empty-slot">Empty</span>
                    )}
                  </div>
                );
              })}
            </div>
            
            <div className="team-summary">
              <p>Total Spent: ${15 - (teams[currentViewTeam]?.budget || 0)}</p>
              <p>Budget Remaining: ${teams[currentViewTeam]?.budget || 0}</p>
              {teams[currentViewTeam]?.bonus > 0 && (
                <p>Bonus Earned: ${teams[currentViewTeam].bonus}</p>
              )}
            </div>
          </div>
          
          <button onClick={() => navigate('/lobby')} className="return-button">
            Return to Lobby
          </button>
        </div>
      </div>
    );
  }

  // Render active draft
  return (
    <div className="draft-container">
      <div className="draft-header">
        <div className="timer-section">
          <div className={`timer ${isMyTurn ? 'my-turn' : ''}`}>
            Time: <span className="time-value">{draftState.timeRemaining}s</span>
          </div>
          {isMyTurn && <div className="turn-indicator">Your Turn!</div>}
        </div>
        
        <div className="draft-info">
          <span>Round {Math.floor(draftState.currentTurn / 5) + 1} of 5</span>
          <span>Pick {(draftState.currentTurn % 25) + 1} of 25</span>
          <span>Budget: ${budget + bonus}</span>
        </div>
        
        <div className="controls">
          <label>
            <input 
              type="checkbox" 
              checked={autoPickEnabled}
              onChange={(e) => setAutoPickEnabled(e.target.checked)}
            />
            Auto-pick
          </label>
          <label>
            <input 
              type="checkbox" 
              checked={showAutoPickSuggestion}
              onChange={(e) => setShowAutoPickSuggestion(e.target.checked)}
            />
            Show suggestions
          </label>
        </div>
      </div>

      <div className="player-board">
        {draftState.playerBoard?.map((row, rowIndex) => (
          <div key={rowIndex} className="price-row">
            <div className="price-label">${5 - rowIndex}</div>
            {row.map((player, colIndex) => {
              const isAutoSuggestion = autoPickSuggestion && 
                autoPickSuggestion.row === rowIndex && 
                autoPickSuggestion.col === colIndex;
              
              return (
                <div
                  key={`${rowIndex}-${colIndex}`}
                  className={`player-card 
                    ${player.drafted ? 'drafted' : ''} 
                    ${player.drafted && player.draftedBy !== undefined ? 
                      `drafted-by-${teams[player.draftedBy]?.color?.toLowerCase()}` : ''} 
                    ${isAutoSuggestion ? 'auto-suggestion' : ''}
                    ${isMyTurn && !player.drafted ? 'clickable' : ''}
                  `}
                  onClick={() => isMyTurn && !player.drafted && selectPlayer(rowIndex, colIndex)}
                >
                  <div className={`position-badge ${player.position}`}>
                    {player.position}
                  </div>
                  <div className="player-name">{player.name}</div>
                  <div className="player-team">{player.team} - ${player.price}</div>
                  {isAutoSuggestion && (
                    <div className="suggestion-indicator">⭐ Best Pick</div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="teams-section">
        {teams.map((team, index) => {
          const isCurrentTurn = draftState.draftOrder[draftState.currentTurn] === team.draftPosition;
          
          return (
            <div 
              key={team.userId} 
              className={`team-card 
                ${isCurrentTurn ? 'current-turn' : ''} 
                ${team.userId === user?.id ? 'my-team' : ''}
                team-${team.color?.toLowerCase()}
              `}
            >
              <div className="team-header">
                <h3>{team.name}</h3>
                <span className="budget">${team.budget}</span>
                {team.bonus > 0 && <span className="bonus">+${team.bonus}</span>}
              </div>
              
              <div className="roster">
                {['QB', 'RB', 'WR', 'TE', 'FLEX'].map(slot => (
                  <div key={slot} className="roster-slot">
                    <span className="slot-label">{slot}:</span>
                    {team.roster[slot] ? (
                      <span className="player">{team.roster[slot].name}</span>
                    ) : (
                      <span className="empty">-</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default DraftScreen;