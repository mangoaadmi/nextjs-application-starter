const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 8080 });

// Official SHASN Game State
const gameState = {
  players: {},
  zones: [
    { id: 1, name: 'North-West', maxVoters: 11, majorityRequired: 6, voters: [], volatileAreas: [1] },
    { id: 2, name: 'North', maxVoters: 9, majorityRequired: 5, voters: [], volatileAreas: [1] },
    { id: 3, name: 'North-East', maxVoters: 7, majorityRequired: 4, voters: [], volatileAreas: [1] },
    { id: 4, name: 'West', maxVoters: 9, majorityRequired: 5, voters: [], volatileAreas: [1] },
    { id: 5, name: 'Center', maxVoters: 13, majorityRequired: 7, voters: [], volatileAreas: [2] },
    { id: 6, name: 'East', maxVoters: 9, majorityRequired: 5, voters: [], volatileAreas: [1] },
    { id: 7, name: 'South-West', maxVoters: 7, majorityRequired: 4, voters: [], volatileAreas: [1] },
    { id: 8, name: 'South', maxVoters: 9, majorityRequired: 5, voters: [], volatileAreas: [1] },
    { id: 9, name: 'South-East', maxVoters: 11, majorityRequired: 6, voters: [], volatileAreas: [1] }
  ],
  turnOrder: [],
  currentTurn: 0,
  gamePhase: 'setup', // setup, playing, ended
  
  // SHASN Resources: Campaign Funds, Street Clout, Media Attention, Public Trust
  resources: {
    funds: 'Campaign Funds',
    clout: 'Street Clout', 
    media: 'Media Attention',
    trust: 'Public Trust'
  },
  
  // Ideology Cards (sample from rulebook)
  ideologyCards: [
    {
      id: 1,
      question: "Should the government increase minimum wage?",
      capitalist: { text: "No, let market forces decide wages", resources: { funds: 2, clout: 1 } },
      idealist: { text: "Yes, workers deserve living wages", resources: { trust: 2, media: 1 } }
    },
    {
      id: 2,
      question: "How should we handle immigration?",
      supremo: { text: "Strict border controls and deportations", resources: { clout: 2, funds: 1 } },
      showstopper: { text: "Open borders and amnesty programs", resources: { media: 2, trust: 1 } }
    },
    {
      id: 3,
      question: "What's the priority for healthcare?",
      idealist: { text: "Universal healthcare for all", resources: { trust: 3 } },
      capitalist: { text: "Private healthcare competition", resources: { funds: 3 } }
    },
    {
      id: 4,
      question: "How should we address climate change?",
      idealist: { text: "Aggressive environmental regulations", resources: { trust: 2, media: 1 } },
      capitalist: { text: "Market-based solutions and innovation", resources: { funds: 2, clout: 1 } }
    }
  ],
  
  // Voter Cards (cost combinations to influence voters)
  voterCards: [
    { id: 1, voters: 1, cost: { funds: 1 } },
    { id: 2, voters: 1, cost: { clout: 1 } },
    { id: 3, voters: 1, cost: { media: 1 } },
    { id: 4, voters: 1, cost: { trust: 1 } },
    { id: 5, voters: 2, cost: { funds: 1, clout: 1 } },
    { id: 6, voters: 2, cost: { media: 1, trust: 1 } },
    { id: 7, voters: 3, cost: { funds: 2, clout: 1, media: 1 } },
    { id: 8, voters: 3, cost: { trust: 2, media: 1, clout: 1 } }
  ],
  
  openVoterCards: [],
  
  // Conspiracy Cards
  conspiracyCards: [
    { id: 1, name: "Media Manipulation", cost: 4, effect: "Gain 2 extra voters on next influence" },
    { id: 2, name: "Coalition Building", cost: 5, effect: "Form temporary alliance with another player" },
    { id: 3, name: "Gerrymandering", cost: 4, effect: "Move 2 voters between adjacent zones" },
    { id: 4, name: "Voter Suppression", cost: 5, effect: "Remove 1 opponent voter from any zone" }
  ],
  
  // Headline Cards (triggered by volatile areas)
  headlineCards: [
    { id: 1, title: "Economic Crisis", effect: "All players lose 2 funds" },
    { id: 2, title: "Social Unrest", effect: "Gain 1 clout, lose 1 trust" },
    { id: 3, title: "Media Scandal", effect: "Player with most media loses 3 media" },
    { id: 4, title: "Grassroots Movement", effect: "Gain 2 trust resources" }
  ],
  
  currentIdeologyCard: null,
  pendingHeadlines: []
};

// Initialize open voter cards
function initializeVoterCards() {
  const shuffled = [...gameState.voterCards].sort(() => Math.random() - 0.5);
  gameState.openVoterCards = shuffled.slice(0, 3);
}

// Store client connections
const clients = new Map();

console.log('SHASN WebSocket Server running on port 8080');
console.log('Official SHASN rules implementation');

wss.on('connection', (ws) => {
  const playerId = generateUniqueId();
  console.log(`Player ${playerId} connected`);
  
  // Initialize player with starting resources based on turn order
  const playerCount = Object.keys(gameState.players).length;
  
  gameState.players[playerId] = {
    id: playerId,
    name: `Player ${Object.keys(gameState.players).length + 1}`,
    resources: { funds: 0, clout: 0, media: 0, trust: 0 },
    resourceCap: 12,
    ideologyCards: [],
    conspiracyCards: [],
    votersOnBoard: 0,
    majorityVoters: 0,
    ideologuePowers: {
      capitalist: { level: 0, cards: 0 },
      supremo: { level: 0, cards: 0 },
      showstopper: { level: 0, cards: 0 },
      idealist: { level: 0, cards: 0 }
    },
    gerrymanderingRights: [],
    isReady: false
  };
  
  // Distribute starting resources (offset first player advantage)
  const totalStartingResources = playerCount + 1;
  for (let i = 0; i < totalStartingResources; i++) {
    const resourceTypes = ['funds', 'clout', 'media', 'trust'];
    const randomResource = resourceTypes[Math.floor(Math.random() * resourceTypes.length)];
    gameState.players[playerId].resources[randomResource]++;
  }
  
  // Add to turn order if game hasn't started
  if (gameState.gamePhase === 'setup') {
    gameState.turnOrder.push(playerId);
    if (gameState.openVoterCards.length === 0) {
      initializeVoterCards();
    }
  }
  
  clients.set(playerId, ws);
  
  // Send initial game state to new player
  ws.send(JSON.stringify({
    type: 'gameState',
    state: gameState,
    playerId: playerId
  }));
  
  // Broadcast player joined to all clients
  broadcast({
    type: 'playerJoined',
    player: gameState.players[playerId],
    totalPlayers: Object.keys(gameState.players).length
  });
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      processMessage(data, playerId, ws);
    } catch (err) {
      console.error('Error processing message:', err);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Invalid message format'
      }));
    }
  });
  
  ws.on('close', () => {
    console.log(`Player ${playerId} disconnected`);
    delete gameState.players[playerId];
    clients.delete(playerId);
    
    // Remove from turn order
    gameState.turnOrder = gameState.turnOrder.filter(id => id !== playerId);
    
    broadcast({
      type: 'playerDisconnected',
      playerId: playerId,
      totalPlayers: Object.keys(gameState.players).length
    });
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

function processMessage(data, playerId, ws) {
  const player = gameState.players[playerId];
  
  switch (data.type) {
    case 'startGame':
      if (Object.keys(gameState.players).length >= 2) {
        gameState.gamePhase = 'playing';
        gameState.currentTurn = 0;
        
        // Draw first ideology card for first player
        drawIdeologyCard();
        
        broadcast({
          type: 'gameStarted',
          state: gameState
        });
      } else {
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Need at least 2 players to start'
        }));
      }
      break;
      
    case 'answerIdeology':
      if (gameState.turnOrder[gameState.currentTurn] === playerId && gameState.currentIdeologyCard) {
        handleIdeologyAnswer(data, playerId);
      }
      break;
      
    case 'redrawIdeology':
      if (gameState.turnOrder[gameState.currentTurn] === playerId) {
        handleRedrawIdeology(playerId);
      }
      break;
      
    case 'influenceVoters':
      handleInfluenceVoters(data, playerId);
      break;
      
    case 'placeVoters':
      handlePlaceVoters(data, playerId);
      break;
      
    case 'gerrymander':
      handleGerrymander(data, playerId);
      break;
      
    case 'trade':
      handleTrade(data, playerId);
      break;
      
    case 'endTurn':
      handleEndTurn(playerId);
      break;
      
    default:
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Unknown message type'
      }));
  }
}

function drawIdeologyCard() {
  const shuffled = [...gameState.ideologyCards].sort(() => Math.random() - 0.5);
  gameState.currentIdeologyCard = shuffled[0];
}

function handleIdeologyAnswer(data, playerId) {
  const player = gameState.players[playerId];
  const card = gameState.currentIdeologyCard;
  const answer = data.answer; // 'capitalist', 'supremo', 'showstopper', 'idealist'
  
  if (card[answer]) {
    // Give resources
    const rewards = card[answer].resources;
    Object.keys(rewards).forEach(resource => {
      player.resources[resource] += rewards[resource];
    });
    
    // Add ideology card to player
    player.ideologyCards.push({
      id: card.id,
      question: card.question,
      answer: answer,
      answerText: card[answer].text,
      resources: rewards
    });
    
    // Update ideologue powers
    player.ideologuePowers[answer].cards++;
    updateIdeologuePowers(player, answer);
    
    // Apply passive powers (1 extra resource per 2 cards of same ideologue)
    applyPassivePowers(player);
    
    // Check resource cap
    enforceResourceCap(player);
    
    broadcast({
      type: 'ideologyAnswered',
      playerId: playerId,
      answer: answer,
      card: card,
      state: gameState
    });
    
    gameState.currentIdeologyCard = null;
  }
}

function handleRedrawIdeology(playerId) {
  const player = gameState.players[playerId];
  const totalResources = player.resources.funds + player.resources.clout + 
                        player.resources.media + player.resources.trust;
  
  if (totalResources >= 4) {
    // Pay 4 resources (any combination)
    let remaining = 4;
    ['funds', 'clout', 'media', 'trust'].forEach(resource => {
      const toDeduct = Math.min(remaining, player.resources[resource]);
      player.resources[resource] -= toDeduct;
      remaining -= toDeduct;
    });
    
    drawIdeologyCard();
    
    broadcast({
      type: 'ideologyRedrawn',
      playerId: playerId,
      state: gameState
    });
  }
}

function handleInfluenceVoters(data, playerId) {
  const player = gameState.players[playerId];
  const voterCard = gameState.openVoterCards.find(card => card.id === data.cardId);
  
  if (voterCard && canAffordCost(player, voterCard.cost)) {
    // Pay cost
    Object.keys(voterCard.cost).forEach(resource => {
      player.resources[resource] -= voterCard.cost[resource];
    });
    
    // Remove card from open cards and replace
    gameState.openVoterCards = gameState.openVoterCards.filter(card => card.id !== data.cardId);
    const shuffled = [...gameState.voterCards].sort(() => Math.random() - 0.5);
    gameState.openVoterCards.push(shuffled[0]);
    
    broadcast({
      type: 'votersInfluenced',
      playerId: playerId,
      voterCard: voterCard,
      votersToPlace: voterCard.voters,
      state: gameState
    });
  }
}

function handlePlaceVoters(data, playerId) {
  const zone = gameState.zones.find(z => z.id === data.zoneId);
  const voterCount = data.voterCount;
  
  if (zone && zone.voters.length + voterCount <= zone.maxVoters) {
    // Add voters to zone
    for (let i = 0; i < voterCount; i++) {
      zone.voters.push({
        playerId: playerId,
        isMajority: false,
        inVolatileArea: data.volatileArea || false
      });
    }
    
    // Check for majority formation
    checkMajorityFormation(zone);
    
    // Update gerrymandering rights
    updateGerrymanderingRights(zone);
    
    // Trigger headlines if voters placed in volatile areas
    if (data.volatileArea) {
      triggerHeadline();
    }
    
    broadcast({
      type: 'votersPlaced',
      playerId: playerId,
      zoneId: data.zoneId,
      voterCount: voterCount,
      state: gameState
    });
  }
}

function handleGerrymander(data, playerId) {
  const player = gameState.players[playerId];
  const fromZone = gameState.zones.find(z => z.id === data.fromZoneId);
  const toZone = gameState.zones.find(z => z.id === data.toZoneId);
  
  if (player.gerrymanderingRights.includes(data.fromZoneId) && 
      fromZone && toZone && areZonesAdjacent(data.fromZoneId, data.toZoneId)) {
    
    // Find non-majority voter to move
    const voterIndex = fromZone.voters.findIndex(v => !v.isMajority && !v.inVolatileArea);
    
    if (voterIndex !== -1 && toZone.voters.length < toZone.maxVoters) {
      const voter = fromZone.voters.splice(voterIndex, 1)[0];
      toZone.voters.push(voter);
      
      // Update majorities and gerrymandering rights
      checkMajorityFormation(fromZone);
      checkMajorityFormation(toZone);
      updateGerrymanderingRights(fromZone);
      updateGerrymanderingRights(toZone);
      
      broadcast({
        type: 'gerrymandered',
        playerId: playerId,
        fromZoneId: data.fromZoneId,
        toZoneId: data.toZoneId,
        state: gameState
      });
    }
  }
}

function handleTrade(data, playerId) {
  broadcast({
    type: 'tradeProposal',
    fromPlayer: playerId,
    proposal: data.proposal,
    targetPlayer: data.targetPlayer || null
  });
}

function handleEndTurn(playerId) {
  if (gameState.turnOrder[gameState.currentTurn] === playerId) {
    // Resolve any pending headlines
    resolvePendingHeadlines();
    
    // Move to next turn
    gameState.currentTurn = (gameState.currentTurn + 1) % gameState.turnOrder.length;
    
    // Draw new ideology card for next player
    drawIdeologyCard();
    
    // Check win condition
    if (checkWinCondition()) {
      endGame();
    } else {
      broadcast({
        type: 'turnEnded',
        nextPlayer: gameState.turnOrder[gameState.currentTurn],
        state: gameState
      });
    }
  }
}

function checkMajorityFormation(zone) {
  const playerVoterCounts = {};
  
  zone.voters.forEach(voter => {
    playerVoterCounts[voter.playerId] = (playerVoterCounts[voter.playerId] || 0) + 1;
  });
  
  // Find player with most voters
  let majorityPlayer = null;
  let maxVoters = 0;
  
  Object.entries(playerVoterCounts).forEach(([playerId, count]) => {
    if (count >= zone.majorityRequired && count > maxVoters) {
      majorityPlayer = playerId;
      maxVoters = count;
    }
  });
  
  // Reset all majority flags
  zone.voters.forEach(voter => voter.isMajority = false);
  
  // Set majority flags for winning player
  if (majorityPlayer) {
    let majorityCount = 0;
    zone.voters.forEach(voter => {
      if (voter.playerId === majorityPlayer && majorityCount < zone.majorityRequired) {
        voter.isMajority = true;
        majorityCount++;
      }
    });
    
    // Update player's majority voter count
    gameState.players[majorityPlayer].majorityVoters = 
      Object.values(gameState.zones).reduce((total, z) => {
        return total + z.voters.filter(v => v.playerId === majorityPlayer && v.isMajority).length;
      }, 0);
  }
}

function updateGerrymanderingRights(zone) {
  const playerVoterCounts = {};
  
  zone.voters.forEach(voter => {
    playerVoterCounts[voter.playerId] = (playerVoterCounts[voter.playerId] || 0) + 1;
  });
  
  let maxVoters = 0;
  let gerrymanderPlayer = null;
  let tie = false;
  
  Object.entries(playerVoterCounts).forEach(([playerId, count]) => {
    if (count > maxVoters) {
      maxVoters = count;
      gerrymanderPlayer = playerId;
      tie = false;
    } else if (count === maxVoters && maxVoters > 0) {
      tie = true;
    }
  });
  
  // Update gerrymandering rights
  Object.values(gameState.players).forEach(player => {
    player.gerrymanderingRights = player.gerrymanderingRights.filter(zId => zId !== zone.id);
  });
  
  if (gerrymanderPlayer && !tie) {
    gameState.players[gerrymanderPlayer].gerrymanderingRights.push(zone.id);
  }
}

function updateIdeologuePowers(player, ideologue) {
  const cardCount = player.ideologuePowers[ideologue].cards;
  
  if (cardCount >= 5) {
    player.ideologuePowers[ideologue].level = 5;
  } else if (cardCount >= 3) {
    player.ideologuePowers[ideologue].level = 3;
  }
}

function applyPassivePowers(player) {
  ['capitalist', 'supremo', 'showstopper', 'idealist'].forEach(ideologue => {
    const cardCount = player.ideologuePowers[ideologue].cards;
    const bonusResources = Math.floor(cardCount / 2);
    
    if (bonusResources > 0) {
      const resourceMap = {
        capitalist: 'funds',
        supremo: 'clout', 
        showstopper: 'media',
        idealist: 'trust'
      };
      
      player.resources[resourceMap[ideologue]] += bonusResources;
    }
  });
}

function enforceResourceCap(player) {
  const totalResources = player.resources.funds + player.resources.clout + 
                        player.resources.media + player.resources.trust;
  
  if (totalResources > player.resourceCap) {
    // Player must discard excess resources
    broadcast({
      type: 'resourceCapExceeded',
      playerId: player.id,
      excess: totalResources - player.resourceCap
    });
  }
}

function canAffordCost(player, cost) {
  return Object.keys(cost).every(resource => player.resources[resource] >= cost[resource]);
}

function areZonesAdjacent(zone1Id, zone2Id) {
  // Define adjacency matrix for 9 zones (3x3 grid)
  const adjacency = {
    1: [2, 4, 5], // North-West
    2: [1, 3, 4, 5, 6], // North  
    3: [2, 5, 6], // North-East
    4: [1, 2, 5, 7, 8], // West
    5: [1, 2, 3, 4, 6, 7, 8, 9], // Center
    6: [2, 3, 5, 8, 9], // East
    7: [4, 5, 8], // South-West
    8: [4, 5, 6, 7, 9], // South
    9: [5, 6, 8] // South-East
  };
  
  return adjacency[zone1Id] && adjacency[zone1Id].includes(zone2Id);
}

function triggerHeadline() {
  const shuffled = [...gameState.headlineCards].sort(() => Math.random() - 0.5);
  gameState.pendingHeadlines.push(shuffled[0]);
}

function resolvePendingHeadlines() {
  gameState.pendingHeadlines.forEach(headline => {
    broadcast({
      type: 'headlineTriggered',
      headline: headline,
      state: gameState
    });
  });
  gameState.pendingHeadlines = [];
}

function checkWinCondition() {
  // Game ends when all possible majorities are formed
  return gameState.zones.every(zone => {
    const playerVoterCounts = {};
    zone.voters.forEach(voter => {
      playerVoterCounts[voter.playerId] = (playerVoterCounts[voter.playerId] || 0) + 1;
    });
    
    return Object.values(playerVoterCounts).some(count => count >= zone.majorityRequired);
  });
}

function endGame() {
  // Calculate final scores (majority voters only)
  const scores = {};
  Object.keys(gameState.players).forEach(playerId => {
    scores[playerId] = gameState.players[playerId].majorityVoters;
  });
  
  const winner = Object.keys(scores).reduce((a, b) => scores[a] > scores[b] ? a : b);
  
  gameState.gamePhase = 'ended';
  
  broadcast({
    type: 'gameEnded',
    winner: winner,
    scores: scores,
    finalState: gameState
  });
}

function broadcast(message) {
  const messageStr = JSON.stringify(message);
  clients.forEach((ws, playerId) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(messageStr);
    }
  });
}

function generateUniqueId() {
  return Math.random().toString(36).substr(2, 9);
}

// Handle server shutdown gracefully
process.on('SIGINT', () => {
  console.log('Shutting down WebSocket server...');
  wss.close(() => {
    console.log('WebSocket server closed');
    process.exit(0);
  });
});
