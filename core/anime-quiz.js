const QUESTION_BANK = [
  { q: 'Quel est le prénom du frère de Sasuke Uchiwa ?', a: ['Itachi', 'Madara', 'Shisui', 'Obito'], correct: 'A', explain: 'Itachi est le frère aîné de Sasuke.' },
  { q: 'Dans One Piece, comment s’appelle le bateau de l’équipage après le Going Merry ?', a: ['Red Force', 'Thousand Sunny', 'Polar Tang', 'Moby Dick'], correct: 'B', explain: 'Le Thousand Sunny succède au Going Merry.' },
  { q: 'Quel est le nom du héros de My Hero Academia ?', a: ['Katsuki Bakugo', 'Shoto Todoroki', 'Izuku Midoriya', 'Tenya Iida'], correct: 'C', explain: 'Le héros principal est Izuku Midoriya, aussi appelé Deku.' },
  { q: 'Dans Dragon Ball, qui est le père de Gohan ?', a: ['Vegeta', 'Piccolo', 'Yamcha', 'Son Goku'], correct: 'D', explain: 'Gohan est le fils de Son Goku et Chi-Chi.' },
  { q: 'Quel est le pouvoir principal de Tanjiro au début de Demon Slayer ?', a: ['Respiration de l’Eau', 'Respiration de la Foudre', 'Respiration de la Bête', 'Respiration de la Brume'], correct: 'A', explain: 'Tanjiro apprend d’abord la Respiration de l’Eau.' },
  { q: 'Dans Naruto, quel démon est scellé en Naruto ?', a: ['Shukaku', 'Kurama', 'Gyuki', 'Matatabi'], correct: 'B', explain: 'Kurama est le démon-renard à neuf queues.' },
  { q: 'Quel est le nom du capitaine des Chapeaux de paille ?', a: ['Zoro', 'Sanji', 'Monkey D. Luffy', 'Usopp'], correct: 'C', explain: 'Monkey D. Luffy dirige l’équipage.' },
  { q: 'Dans Death Note, quel objet permet de tuer une personne en écrivant son nom ?', a: ['Un grimoire', 'Un carnet rouge', 'Un parchemin', 'Le Death Note'], correct: 'D', explain: 'Le Death Note est le carnet au cœur de l’histoire.' },
  { q: 'Quel est le nom de l’alchimiste d’État surnommé Fullmetal ?', a: ['Edward Elric', 'Alphonse Elric', 'Roy Mustang', 'Ling Yao'], correct: 'A', explain: 'Edward Elric porte le titre de Fullmetal Alchemist.' },
  { q: 'Dans Jujutsu Kaisen, qui est le professeur aux cheveux blancs ?', a: ['Kento Nanami', 'Satoru Gojo', 'Suguru Geto', 'Aoi Todo'], correct: 'B', explain: 'Satoru Gojo est le professeur aux cheveux blancs.' },
  { q: 'Quel est le prénom de la sœur de Tanjiro ?', a: ['Kanao', 'Mitsuri', 'Nezuko', 'Shinobu'], correct: 'C', explain: 'La sœur de Tanjiro s’appelle Nezuko Kamado.' },
  { q: 'Dans Attack on Titan, quel mur est le plus extérieur au début ?', a: ['Maria', 'Rose', 'Sina', 'Trost'], correct: 'A', explain: 'Le mur Maria est le plus extérieur.' },
  { q: 'Dans Haikyuu!!, quel sport est pratiqué ?', a: ['Basket-ball', 'Volley-ball', 'Football', 'Tennis'], correct: 'B', explain: 'Haikyuu!! suit une équipe de volley-ball.' },
  { q: 'Quel est le nom du rival de Yugi dans Yu-Gi-Oh! ?', a: ['Joey Wheeler', 'Maximillion Pegasus', 'Seto Kaiba', 'Tristan Taylor'], correct: 'C', explain: 'Seto Kaiba est le grand rival de Yugi.' },
  { q: 'Dans Spy x Family, quel est le prénom de la fille télépathe ?', a: ['Yor', 'Becky', 'Fiona', 'Anya'], correct: 'D', explain: 'Anya Forger peut lire les pensées.' },
  { q: 'Dans Pokémon, quel Pokémon accompagne souvent Sacha ?', a: ['Pikachu', 'Évoli', 'Carapuce', 'Salamèche'], correct: 'A', explain: 'Pikachu est le partenaire emblématique de Sacha.' },
  { q: 'Dans Bleach, quel est le nom du héros principal ?', a: ['Uryu Ishida', 'Ichigo Kurosaki', 'Renji Abarai', 'Byakuya Kuchiki'], correct: 'B', explain: 'Ichigo Kurosaki est le protagoniste de Bleach.' },
  { q: 'Dans Sailor Moon, quel est le prénom civil de Sailor Moon ?', a: ['Rei Hino', 'Ami Mizuno', 'Usagi Tsukino', 'Makoto Kino'], correct: 'C', explain: 'Sailor Moon est Usagi Tsukino.' },
  { q: 'Dans Hunter x Hunter, quel est le prénom du meilleur ami de Gon ?', a: ['Kurapika', 'Leorio', 'Hisoka', 'Killua'], correct: 'D', explain: 'Killua Zoldyck devient le meilleur ami de Gon.' },
  { q: 'Dans Tokyo Revengers, quel est le prénom du chef surnommé Mikey ?', a: ['Manjiro', 'Ken', 'Takemichi', 'Keisuke'], correct: 'A', explain: 'Mikey est le surnom de Manjiro Sano.' },
];

const LETTERS = ['A', 'B', 'C', 'D'];
const games = new Map();

function shuffle(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function questionText(question, number, score, prefix) {
  const options = question.a.map((answer, index) => `${LETTERS[index]}) ${answer}`);
  return [
    `🎌 QUIZ ANIME — Question ${number}`,
    '',
    question.q,
    ...options,
    '',
    `Réponds par A, B, C ou D. Score : ${score} point(s).`,
    `Commandes : ${prefix}quiz stop | ${prefix}quiz score`,
  ].join('\n');
}

export function registerAnimeQuiz({ register, sendText, getPrefix }) {
  register('quiz', 'JEUX ANIME', 'Lancer un quiz anime : .quiz anime, .quiz score ou .quiz stop', async ({ chat, args }) => {
    const action = (args[0] || '').toLowerCase();
    if (action === 'anime' || action === 'start') {
      const order = shuffle(QUESTION_BANK.map((_, index) => index));
      const game = { order, cursor: 0, score: 0, answered: 0, current: null };
      games.set(chat, game);
      game.current = QUESTION_BANK[game.order[game.cursor]];
      game.cursor += 1;
      await sendText(chat, `🎮 Quiz anime démarré ! ${QUESTION_BANK.length} questions dans la banque; elles sont mélangées et le cycle recommence sans fin.\n\n${questionText(game.current, 1, game.score, getPrefix())}`);
      return;
    }
    if (action === 'stop') {
      const game = games.get(chat);
      if (!game) throw new Error('Aucun quiz actif dans cette conversation.');
      games.delete(chat);
      await sendText(chat, `🛑 Quiz terminé. Score final : ${game.score}/${game.answered}. Bien joué !`);
      return;
    }
    if (action === 'score') {
      const game = games.get(chat);
      if (!game) throw new Error('Aucun quiz actif. Lance ${getPrefix()}quiz anime.');
      await sendText(chat, `🎯 Score actuel : ${game.score}/${game.answered}. Questions répondues : ${game.answered}.`);
      return;
    }
    throw new Error(`Utilise ${getPrefix()}quiz anime, ${getPrefix()}quiz score ou ${getPrefix()}quiz stop.`);
  });
}

export async function handleAnimeQuizIncoming(message, { sendText, getPrefix }) {
  const chat = message?.key?.remoteJid || '';
  const game = games.get(chat);
  if (!game || message?.key?.fromMe) return false;
  const content = message.message || {};
  const text = (content.conversation || content.extendedTextMessage?.text || '').trim().toUpperCase();
  if (!LETTERS.includes(text)) return false;

  const question = game.current;
  game.answered += 1;
  const correct = text === question.correct;
  if (correct) game.score += 1;
  const feedback = correct
    ? `✅ Bonne réponse ! ${question.explain}`
    : `❌ Pas tout à fait. La bonne réponse était ${question.correct}) ${question.a[LETTERS.indexOf(question.correct)]}. ${question.explain}`;

  if (game.cursor >= game.order.length) {
    game.order = shuffle(QUESTION_BANK.map((_, index) => index));
    game.cursor = 0;
  }
  game.current = QUESTION_BANK[game.order[game.cursor]];
  game.cursor += 1;
  await sendText(chat, `${feedback}\n\n${questionText(game.current, game.answered + 1, game.score, getPrefix())}`);
  return true;
}

export function resetAnimeQuizForTests() {
  games.clear();
}
