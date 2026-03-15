const QUARTIER_COLORS = {
  bogota: '#d4763a',
  littleferry: '#8e7cc3',
  edgewater: '#6fa8dc',
  northbergen: '#a64d79',
  harlem: '#e6b422',
  bronx: '#e06666',
  northbroadway: '#76a5af',
  centralpark: '#93c47d',
  greenwich: '#b4a7d6',
  chinatown: '#f6b26b',
  skyline: '#a4c2f4',
  jerseycity: '#ffe599',
  queens: '#6d9eeb',
  brooklyn: '#e67373',
  cypresshill: '#cc9966',
  ile: '#4a6670'
};

const FACILITE_LABELS = {
  annexe_zurich_bank: '$ Annexe Z-Bank',
  zurich_bank: '$ Zurich Bank Centrale',
  port: '⚓ Port',
  peage: '🛣 Péage',
  hotel_police: '🚔 Hôtel de Police',
  mairie: '🏛 Mairie',
  ambassade: '🏢 Ambassade',
  immigration: '📋 Immigration',
  douanes: '📦 Douanes',
  cimetiere: '⚰ Cimetière',
  aeroport: '✈ Aéroport',
  ile: '🏝 Île'
};

const FACILITE_ICONS = {
  annexe_zurich_bank: '$',
  zurich_bank: '$',
  port: '⚓',
  peage: '⛽',
  hotel_police: '🚔',
  mairie: '🏛',
  ambassade: '🏢',
  immigration: '📋',
  douanes: '📦',
  cimetiere: '✝',
  aeroport: '✈',
  ile: '🏝'
};

const BLOCK_POSITIONS = {
  bogota_bogota:           { x: 115, y: 42, w: 42, h: 30 },
  bogota_hackensack:       { x: 70,  y: 65, w: 48, h: 30 },
  bogota_teaneck:          { x: 148, y: 68, w: 42, h: 30 },
  bogota_englewood:        { x: 210, y: 48, w: 48, h: 30 },
  bogota_englewood_cliffs: { x: 270, y: 68, w: 52, h: 30 },

  littleferry_ridgefield_park: { x: 78,  y: 130, w: 50, h: 30 },
  littleferry_little_ferry:    { x: 40,  y: 168, w: 48, h: 28 },
  littleferry_moonachie:       { x: 100, y: 175, w: 48, h: 28 },

  edgewater_fort_lee:    { x: 275, y: 140, w: 50, h: 32 },
  edgewater_ridgefield:  { x: 195, y: 195, w: 48, h: 32 },
  edgewater_edgewater:   { x: 175, y: 258, w: 48, h: 35 },
  edgewater_fairview:    { x: 155, y: 325, w: 48, h: 35 },

  northbergen_union_city: { x: 140, y: 400, w: 50, h: 32 },
  northbergen_gutenberg:  { x: 165, y: 448, w: 48, h: 30 },
  northbergen_weehawken:  { x: 155, y: 500, w: 50, h: 32 },

  harlem_inwood_hill_park: { x: 390, y: 105, w: 52, h: 32 },
  harlem_high_bridge_park: { x: 400, y: 170, w: 48, h: 35 },
  harlem_west_155th_st:    { x: 420, y: 235, w: 55, h: 32 },
  harlem_lennox_avenue:    { x: 440, y: 290, w: 50, h: 32 },
  harlem_east_harlem:      { x: 495, y: 260, w: 50, h: 35 },

  bronx_kings_bridge:    { x: 530, y: 95,  w: 52, h: 35 },
  bronx_tremont:         { x: 560, y: 155, w: 50, h: 35 },
  bronx_high_bridge:     { x: 530, y: 210, w: 55, h: 35 },
  bronx_morrisania:      { x: 600, y: 195, w: 50, h: 32 },
  bronx_yankee_stadium:  { x: 580, y: 255, w: 55, h: 32 },
  bronx_mott_haven:      { x: 560, y: 310, w: 50, h: 35 },
  bronx_hunts_point:     { x: 620, y: 335, w: 50, h: 32 },

  northbroadway_riverbank_state_park: { x: 355, y: 280, w: 50, h: 35 },
  northbroadway_washington_heights:   { x: 365, y: 220, w: 45, h: 35 },
  northbroadway_upper_w_side:         { x: 340, y: 345, w: 50, h: 35 },

  centralpark_nw_central_park: { x: 395, y: 365, w: 48, h: 32 },
  centralpark_ne_central_park: { x: 455, y: 350, w: 48, h: 32 },
  centralpark_rockefeller:     { x: 385, y: 415, w: 48, h: 30 },
  centralpark_timesquare:      { x: 375, y: 460, w: 48, h: 30 },
  centralpark_upper_east_side: { x: 450, y: 410, w: 52, h: 32 },

  greenwich_chelsea:           { x: 340, y: 510, w: 48, h: 32 },
  greenwich_greenwich_village:  { x: 350, y: 558, w: 52, h: 30 },
  greenwich_soho:              { x: 370, y: 600, w: 45, h: 28 },
  greenwich_tribeca:           { x: 350, y: 640, w: 48, h: 28 },

  chinatown_little_italy:     { x: 420, y: 565, w: 45, h: 28 },
  chinatown_east_village:     { x: 430, y: 530, w: 48, h: 28 },
  chinatown_china_town:       { x: 410, y: 610, w: 45, h: 28 },
  chinatown_lower_east_side:  { x: 445, y: 648, w: 52, h: 30 },

  skyline_5_points:          { x: 380, y: 680, w: 45, h: 28 },
  skyline_world_trade_center: { x: 365, y: 718, w: 50, h: 30 },
  skyline_financial_district: { x: 380, y: 758, w: 50, h: 30 },
  skyline_battery:           { x: 360, y: 800, w: 48, h: 30 },

  jerseycity_hoboken:           { x: 220, y: 540, w: 50, h: 32 },
  jerseycity_washington_park:   { x: 245, y: 610, w: 52, h: 35 },
  jerseycity_jersey_city:       { x: 210, y: 670, w: 55, h: 35 },
  jerseycity_liberty_state_park: { x: 260, y: 740, w: 55, h: 35 },

  queens_laguardia:       { x: 600, y: 400, w: 50, h: 30 },
  queens_astoria:         { x: 560, y: 440, w: 48, h: 30 },
  queens_long_island_city: { x: 520, y: 490, w: 52, h: 32 },
  queens_corona:          { x: 620, y: 470, w: 48, h: 30 },
  queens_flushing_meadows: { x: 660, y: 430, w: 55, h: 30 },
  queens_jackson_heights: { x: 580, y: 510, w: 52, h: 30 },
  queens_maspeth:         { x: 590, y: 560, w: 48, h: 30 },
  queens_middle_village:  { x: 660, y: 530, w: 52, h: 30 },

  brooklyn_green_point:       { x: 498, y: 620, w: 48, h: 30 },
  brooklyn_brooklyn_heights:  { x: 450, y: 730, w: 52, h: 30 },
  brooklyn_atlantic_avenue:   { x: 510, y: 690, w: 52, h: 30 },
  brooklyn_red_hook:          { x: 420, y: 790, w: 48, h: 30 },
  brooklyn_crown_heights:     { x: 560, y: 720, w: 50, h: 28 },
  brooklyn_bedford_stuyvesant: { x: 570, y: 660, w: 55, h: 28 },
  brooklyn_bushwick:          { x: 560, y: 610, w: 48, h: 28 },
  brooklyn_flatbush:          { x: 500, y: 790, w: 48, h: 30 },
  brooklyn_greenwood_cemetery: { x: 448, y: 840, w: 52, h: 30 },
  brooklyn_canarsie:          { x: 540, y: 850, w: 50, h: 30 },

  cypresshill_cypress_hills_cemetery: { x: 640, y: 600, w: 55, h: 30 },
  cypresshill_evergreen_cemetery:     { x: 640, y: 660, w: 55, h: 28 },
  cypresshill_lutheran_cemetery:      { x: 620, y: 720, w: 55, h: 28 },

  ile_roosevelt_island: { x: 505, y: 440, w: 22, h: 40 },
  ile_ward_island:      { x: 540, y: 340, w: 22, h: 30 },
  ile_rickers_island:   { x: 640, y: 365, w: 24, h: 22 },
  ile_statue_of_liberty: { x: 310, y: 830, w: 22, h: 22 }
};

export { QUARTIER_COLORS, FACILITE_LABELS, FACILITE_ICONS, BLOCK_POSITIONS };
