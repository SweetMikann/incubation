/* Original 24px line drawings for plague cards; follows the shared 1.8px icon style. */
(function (global) {
  'use strict';
  const art = {
    dna:'<path d="M7 3c0 8 10 10 10 18M17 3c0 8-10 10-10 18M8 5h8M9 9h6M9 15h6M8 19h8"/>',
    virus:'<circle cx="12" cy="12" r="6"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l3 3M16 16l3 3M19 5l-3 3M8 16l-3 3"/><circle cx="10" cy="10" r=".8"/><circle cx="14" cy="14" r=".8"/>',
    skull:'<path d="M8 20v-4C2 14 4 4 12 4s10 10 4 12v4ZM10 17v3M14 17v3"/><circle cx="9" cy="11" r="1.5"/><circle cx="15" cy="11" r="1.5"/><path d="m11 15 1-2 1 2"/>',
    air:'<path d="M3 8h12c5 0 4-6 1-5M3 12h16M3 16h9c5 0 4 6 1 5"/>',
    water:'<path d="M12 3C9 7 6 10 6 14a6 6 0 0 0 12 0c0-4-3-7-6-11ZM9 14c0 2 1 3 3 3"/>',
    rodent:'<path d="M5 16c-5 0-4-6-1-6M6 16c0-6 5-9 10-5l5 5-5 3H9a3 3 0 0 1-3-3Z"/><circle cx="12" cy="9" r="3"/><path d="M17 14h.1M19 18l2 2M10 19v2"/>',
    insect:'<ellipse cx="12" cy="13" rx="4" ry="6"/><path d="m9 4 3 3 3-3M8 10 4 8M16 10l4-2M8 14H3M16 14h5M9 18l-4 3M15 18l4 3M12 8v11"/>',
    blood:'<path d="M12 3C9 7 6 10 6 14a6 6 0 0 0 12 0c0-4-3-7-6-11ZM9 13h6M12 10v6"/>',
    bird:'<path d="M3 14c5 0 6-7 11-7l3 2 4 1-4 2c-1 6-5 8-10 6l-4 2 1-4ZM8 14l5-3M13 19v2M16 9h.1"/>',
    livestock:'<path d="m7 7-4-3v5l4 2M17 7l4-3v5l-4 2M7 7h10v10c0 5-10 5-10 0ZM8 15h8M10 11v1M14 11v1M10 18h.1M14 18h.1"/>',
    lungs:'<path d="M12 3v9M12 9 8 12M12 9l4 3M8 6C5 7 2 16 4 19c1 2 5 0 5-2V8c0-2 0-3-1-2ZM16 6c3 1 6 10 4 13-1 2-5 0-5-2V8c0-2 0-3 1-2Z"/>',
    stomach:'<path d="M9 3v7c0 3-5 1-5 6 0 6 15 7 16-3 1-5-4-7-7-5V3M7 16c2 3 6 2 8 0"/>',
    skin:'<path d="M3 6c4-3 5 3 9 0s5 3 9 0v13H3Z"/><circle cx="8" cy="12" r="1"/><circle cx="16" cy="15" r="1"/><path d="M12 10v1M7 16v1"/>',
    moon:'<path d="M19 15A8 8 0 0 1 9 4a8 8 0 1 0 10 11ZM16 3l-2 4h4l-2 4"/>',
    brain:'<path d="M12 5c-3-4-7-1-7 2-4 1-3 6-1 7-2 4 2 7 5 5l3 1 3-1c3 2 7-1 5-5 2-1 3-6-1-7 0-3-4-6-7-2ZM12 5v15M5 7l3 2M4 14l4-1M19 7l-3 2M20 14l-4-1"/>',
    pulse:'<path d="M2 12h5l3-7 4 14 3-7h5"/>',
    heat:'<path d="M13 3c2 6-5 7-2 11 2-1 3-3 4-4 6 7 3 11-3 11S2 16 6 11c0 3 2 3 2 3-2-6 3-7 5-11Z"/>',
    cold:'<path d="M12 2v20M3 7l18 10M3 17 21 7M9 4l3 3 3-3M9 20l3-3 3 3M3 11l4-2-1-4M18 19l-1-4 4-2M6 19l1-4-4-2M21 11l-4-2 1-4"/>',
    pill:'<path d="m9 5-4 4a6 6 0 0 0 10 10l4-4A6 6 0 0 0 9 5ZM7 7l10 10"/>',
    shield:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6ZM8 12l3 3 5-6"/>',
    shuffle:'<path d="M3 6h4c4 0 6 12 10 12h4M17 15l4 3-4 3M3 18h4c1 0 2-1 3-3M14 9c1-2 2-3 3-3h4M17 3l4 3-4 3"/>',
    globe:'<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18M5 7h14M5 17h14"/>',
    search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6M7 10h6M10 7v6"/>',
    eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    flask:'<path d="M9 3h6M10 3v6L4 19c-1 2 2 2 2 2h12s3 0 2-2L14 9V3M7 15h10M10 18h.1"/>',
    plane:'<path d="m12 3 2 7 7 4v2l-7-2v5l2 2H8l2-2v-5l-7 2v-2l7-4Z"/>',
    ship:'<path d="M4 13V8h16v5M9 8V4h6v4M3 13l9-3 9 3-3 6H6ZM3 21l3-2 6 2 6-2 3 2"/>',
    barrier:'<path d="M4 7h16v7H4ZM7 7l5 7M14 7l5 7M6 14v7M18 14v7"/>',
    home:'<path d="m3 10 9-7 9 7M5 9v12h14V9M9 15h6M12 12v6"/>',
    cross:'<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6Z"/>',
    syringe:'<path d="m14 3 7 7M17 6 6 17M7 10l7 7M5 12l7 7-4 3-6-6ZM2 22l3-3M14 9l3 3"/>',
    factory:'<path d="M3 21V10l6 3V9l6 4V3h4l2 18ZM6 17h1M11 17h1M17 17h1"/>',
    link:'<path d="m9 15 6-6M8 12l-2 2a4 4 0 0 0 6 6l3-3M16 12l2-2a4 4 0 0 0-6-6L9 7"/>',
    check:'<path d="m5 12 4 4L19 6"/>',
    lock:'<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>'
  };
  const symptomArt = {
    "cough": "<path d=\"M10 21v-4C4 16 3 10 6 6c3-4 9-3 10 1l1 4-3 1v3h-3M8 8h.1M17 14h3M18 18l2 1\"/>",
    "sneeze": "<path d=\"m3 15 6-7 6 7-6 6ZM9 8V3M9 3h5l2 6-3 2M18 5l2-2M19 10h3M17 14l3 2M6 15l3 2 3-2\"/>",
    "pneu": "<path d=\"M11 3v8L8 9M11 8l4 3M7 6C4 9 2 17 5 20c3 1 4-2 4-4V8M16 6c3 2 5 7 5 11 0 4-6 4-6 0v-4M17 10v4M15 12h4\"/>",
    "pulmonary": "<path d=\"M12 3v6M12 7 6 11M12 7l6 4M6 11c-2 3-3 4-3 6a3 3 0 0 0 6 0c0-2-1-3-3-6ZM18 11c-2 3-3 4-3 6a3 3 0 0 0 6 0c0-2-1-3-3-6Z\"/>",
    "nausea": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"m6 9 3 1M18 9l-3 1M7 16l3-2 3 2 3-2M5 3 3 5\"/>",
    "vomit": "<path d=\"M4 20v-4C1 11 5 4 11 5c4 1 5 3 5 6l-3 2M8 8h.1M13 13c0 3 7 1 7 5M12 16c2 3 4 1 5 5M8 14v6M19 21h3\"/>",
    "diarrhea": "<path d=\"M6 3v3H5a3 3 0 0 0-3 3v7a3 3 0 0 0 3 3h5M18 3v3h1a3 3 0 0 1 3 3v6M7 10h9v3H8v3h6v5M11 18l3 3 3-3\"/>",
    "dysentery": "<path d=\"M6 3v3H4v12h5M18 3v3h2v5M8 9h7v3H8v4h3v5M18 13c-2 3-4 4-3 6a3 3 0 0 0 6 0c0-2-2-4-3-6Z\"/>",
    "rash": "<path d=\"M6 3h8l1 6 5 10-7 2-5-9Z\"/><circle cx=\"10\" cy=\"8\" r=\".7\"/><circle cx=\"12\" cy=\"12\" r=\".8\"/><circle cx=\"14\" cy=\"17\" r=\"1\"/><path d=\"m17 5 2-1M18 8h3\"/>",
    "sweat": "<path d=\"M8 21v-3a7 7 0 1 1 10-8l2 4h-4v6M9 9h.1M5 10c-1 2-3 3-3 5a2 2 0 0 0 4 0c0-2-1-3-1-5Z\"/>",
    "skin": "<path d=\"M3 7q4-4 9 0t9 0v13H3ZM12 5l-2 5 4 3-3 6M5 12h2M17 15h2M5 17h2\"/>",
    "necrosis": "<path d=\"M6 3h6l1 7 6 6-5 5-7-7ZM6 10l4 2-2 3M13 15l2 2M16 5l4 4M20 5l-4 4\"/>",
    "insomnia": "<path d=\"M2 14s4-5 9-5 9 5 9 5-4 5-9 5-9-5-9-5Z\"/><circle cx=\"11\" cy=\"14\" r=\"2\"/><path d=\"M21 7a4 4 0 0 1-5-5 4 4 0 1 0 5 5\"/>",
    "paranoia": "<path d=\"m12 3 10 17H2ZM7 14s2-3 5-3 5 3 5 3-2 3-5 3-5-3-5-3Z\"/><circle cx=\"12\" cy=\"14\" r=\"1\"/>",
    "seizure": "<path d=\"M7 21v-4C2 14 3 5 9 3s11 2 11 8l2 4h-4v6M12 5l-4 7h5l-3 6M2 7 1 10M22 5l1 3\"/>",
    "insanity": "<path d=\"M7 21v-4C2 14 3 5 9 3s11 2 11 8l2 4h-4v6M7 7h8v4h-4v4h4M7 11v3M11 7V5\"/>",
    "paralysis": "<circle cx=\"10\" cy=\"5\" r=\"2\"/><path d=\"M10 9v6h6l3 6M10 12h7M7 11a6 6 0 1 0 6 10M3 5l2 2M2 9h2\"/>",
    "coma": "<path d=\"M3 10v11M3 17h18v4M3 12h5v5M8 13h9a4 4 0 0 1 4 4M13 3h6l-6 5h6\"/><circle cx=\"6\" cy=\"10\" r=\"2\"/>",
    "anemia": "<path d=\"M10 3C7 7 4 11 4 15a6 6 0 0 0 12 0c0-4-3-8-6-12ZM7 15h6M18 5h4\"/>",
    "hemo": "<path d=\"M8 3 5 7v14M16 3l3 4v14M8 3c0 4 8 4 8 0M12 9c-2 3-4 5-4 7a4 4 0 0 0 8 0c0-2-2-4-4-7Z\"/>",
    "shock": "<path d=\"M12 6C5-2-3 10 12 21 27 10 19-2 12 6ZM2 12h5l2-4 3 8 2-4h8\"/>",
    "failure": "<path d=\"M9 3h6M12 3v5M4 12V8h16v4M12 8v4M2 13h5v7H2ZM10 13h5v7h-5ZM18 13h4v7h-4M2 3l20 19\"/>",
    "lethalSurge": "<path d=\"M7 21v-5C1 12 4 4 10 4c4 0 6 2 6 5M7 10h1M12 10h1M9 16v5M12 17v4M20 2l-4 9h5l-4 10\"/>"
};
  for(const [id,drawing] of Object.entries(symptomArt)) art["symptom_"+id]=drawing;
  const groups = {
    air:'air air2 bioaerosol', water:'water water2 sweat', rodent:'rodent rodent2', insect:'insect insect2',
    blood:'blood blood2 hematophagy anemia hemo shock', bird:'bird bird2', livestock:'livestock livestock2 zoonosis',
    lungs:'cough sneeze pneu pulmonary', stomach:'nausea vomit diarrhea dysentery', skin:'rash skin',
    skull:'necrosis failure lethalSurge', moon:'insomnia coma', brain:'paranoia seizure insanity', pulse:'paralysis',
    heat:'heat heat2', cold:'cold cold2', pill:'drug drug2 care', dna:'hard1 hard2 antigenDrift',
    shuffle:'sequence shuffle shuffle2 shuffle3', shield:'escape quarant publicHealth', globe:'spreadSurge watch', search:'detect',
    flask:'lab fieldLab', plane:'closeAir', ship:'closePort', barrier:'closeLand', cross:'rescue deployTeams',
    syringe:'vaccine', factory:'manufacture', link:'treaty'
  };
  const cards = {};
  for (const [name, ids] of Object.entries(groups)) for (const id of ids.split(' ')) cards[id] = name;
  for(const id of Object.keys(symptomArt)) cards[id]="symptom_"+id;
  cards.vaccine="vaccineVial";
  art.vaccineVial='<rect x="5" y="7" width="14" height="14" rx="4"/><path d="M8 3h8v4H8ZM9 14h6M12 11v6"/>';
  function svg(name, size=24) {
    return `<svg class="pg-icon" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${art[name] || art.virus}</svg>`;
  }
  global.PlagueIcons = {svg, cards, art};
})(window);
