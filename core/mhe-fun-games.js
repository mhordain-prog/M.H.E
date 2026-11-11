const BANK = [
{c:"culture",d:"facile",q:"Combien de jours compte une année bissextile ?",a:["364","365","366","367"],k:2,e:"Une année bissextile compte 366 jours."},
{c:"culture",d:"moyen",q:"Quel instrument mesure la pression atmosphérique ?",a:["Thermomètre","Baromètre","Hygromètre","Anémomètre"],k:1,e:"Le baromètre mesure la pression atmosphérique."},
{c:"culture",d:"facile",q:"Combien de côtés possède un hexagone ?",a:["5","6","7","8"],k:1,e:"Un hexagone possède six côtés."},
{c:"culture",d:"difficile",q:"Quel est le plus petit nombre premier ?",a:["0","1","2","3"],k:2,e:"2 est le plus petit nombre premier."},
{c:"culture",d:"moyen",q:"Quel organe produit principalement l’insuline ?",a:["Le foie","Le pancréas","Le rein","L’estomac"],k:1,e:"L’insuline est produite par le pancréas."},
{c:"math",d:"facile",q:"Combien font 12 × 8 ?",a:["86","92","96","108"],k:2,e:"12 × 8 = 96."},
{c:"math",d:"moyen",q:"Résous : 3x + 5 = 20. Quelle est la valeur de x ?",a:["3","5","7","8"],k:1,e:"3x = 15, donc x = 5."},
{c:"math",d:"moyen",q:"Quelle est la moitié de 3/4 ?",a:["3/8","2/4","1/8","3/2"],k:0,e:"La moitié de 3/4 est 3/8."},
{c:"math",d:"difficile",q:"Quel est le carré de 15 ?",a:["125","200","225","250"],k:2,e:"15 × 15 = 225."},
{c:"math",d:"facile",q:"Combien font 25 % de 200 ?",a:["25","40","50","75"],k:2,e:"25 % de 200 = 50."},
{c:"science",d:"facile",q:"Quelle planète est surnommée la planète rouge ?",a:["Vénus","Mars","Jupiter","Mercure"],k:1,e:"Mars paraît rouge à cause des oxydes de fer présents à sa surface."},
{c:"science",d:"moyen",q:"Quel gaz les plantes absorbent-elles pour la photosynthèse ?",a:["Oxygène","Azote","Dioxyde de carbone","Hydrogène"],k:2,e:"Les plantes utilisent le dioxyde de carbone pour la photosynthèse."},
{c:"science",d:"facile",q:"À quelle température l’eau pure bout-elle au niveau de la mer ?",a:["0 °C","50 °C","100 °C","150 °C"],k:2,e:"À pression normale, l’eau bout à 100 °C."},
{c:"science",d:"difficile",q:"Quelle particule porte une charge électrique négative ?",a:["Proton","Neutron","Électron","Photon"],k:2,e:"L’électron porte une charge électrique négative."},
{c:"science",d:"moyen",q:"Quel est le symbole chimique de l’or ?",a:["Ag","Au","Fe","Or"],k:1,e:"Le symbole chimique de l’or est Au."},
{c:"histoire",d:"facile",q:"En quelle année la Seconde Guerre mondiale s’est-elle terminée ?",a:["1943","1944","1945","1946"],k:2,e:"La Seconde Guerre mondiale s’est terminée en 1945."},
{c:"histoire",d:"moyen",q:"Quelle civilisation a construit les pyramides de Gizeh ?",a:["Les Romains","Les Égyptiens anciens","Les Perses","Les Grecs"],k:1,e:"Les pyramides de Gizeh ont été construites dans l’Égypte ancienne."},
{c:"histoire",d:"moyen",q:"Quel événement est associé au 14 juillet 1789 en France ?",a:["Waterloo","La prise de la Bastille","Le sacre de Napoléon","La Commune de Paris"],k:1,e:"Le 14 juillet 1789 correspond à la prise de la Bastille."},
{c:"geo",d:"facile",q:"Quel est le plus grand océan du monde ?",a:["Atlantique","Indien","Arctique","Pacifique"],k:3,e:"L’océan Pacifique est le plus vaste."},
{c:"geo",d:"facile",q:"Sur quel continent se trouve le Congo-Brazzaville ?",a:["Asie","Afrique","Europe","Amérique"],k:1,e:"La République du Congo se trouve en Afrique centrale."},
{c:"geo",d:"moyen",q:"Quelle est la capitale du Gabon ?",a:["Bata","Libreville","Malabo","Douala"],k:1,e:"La capitale du Gabon est Libreville."},
{c:"geo",d:"moyen",q:"Quel fleuve traverse notamment l’Égypte ?",a:["Congo","Niger","Nil","Zambèze"],k:2,e:"Le Nil traverse l’Égypte et se jette dans la Méditerranée."},
{c:"geo",d:"facile",q:"Quelle est la capitale du Congo-Brazzaville ?",a:["Kinshasa","Brazzaville","Pointe-Noire","Dolisie"],k:1,e:"La capitale de la République du Congo est Brazzaville."},
{c:"langue",d:"facile",q:"Quel est le pluriel correct de « cheval » ?",a:["Chevals","Chevaux","Chevaus","Chevales"],k:1,e:"Le pluriel usuel de cheval est chevaux."},
{c:"langue",d:"moyen",q:"Dans « Nous avions terminé », quel temps est employé ?",a:["Présent","Passé composé","Plus-que-parfait","Futur antérieur"],k:2,e:"« Avions terminé » est au plus-que-parfait."},
{c:"langue",d:"facile",q:"Quel mot est un synonyme de « rapide » ?",a:["Lent","Prompt","Lourd","Calme"],k:1,e:"Prompt signifie rapide."},
{c:"sport",d:"facile",q:"Combien de joueurs d’une équipe de football sont sur le terrain au début du match ?",a:["9","10","11","12"],k:2,e:"Une équipe de football commence normalement avec onze joueurs."},
{c:"sport",d:"moyen",q:"Dans quel sport utilise-t-on un volant ?",a:["Tennis","Badminton","Basket-ball","Rugby"],k:1,e:"Le badminton se joue avec un volant."},
{c:"logique",d:"facile",q:"Je suis toujours devant toi, mais tu ne peux jamais me voir. Qui suis-je ?",a:["Ton passé","Ton avenir","Ton ombre","Ton reflet"],k:1,e:"Il s’agit de ton avenir."},
{c:"logique",d:"moyen",q:"Un père a 40 ans et son fils 10 ans. Dans combien d’années le père aura-t-il deux fois l’âge de son fils ?",a:["10 ans","15 ans","20 ans","25 ans"],k:2,e:"Dans 20 ans : le père aura 60 ans et le fils 30 ans."},
{c:"logique",d:"facile",q:"Quel nombre complète la suite : 2, 4, 8, 16, … ?",a:["18","24","30","32"],k:3,e:"Chaque nombre est multiplié par 2 : le suivant est 32."},
{c:"vraioufaux",d:"facile",q:"La Terre tourne autour du Soleil.",a:["Vrai","Faux"],k:0,e:"La Terre effectue sa révolution autour du Soleil."},
{c:"vraioufaux",d:"moyen",q:"Le son se propage dans le vide comme dans l’air.",a:["Vrai","Faux"],k:1,e:"Le son a besoin d’un milieu matériel pour se propager."},
{c:"vraioufaux",d:"facile",q:"Le mont Everest est le plus haut sommet au-dessus du niveau de la mer.",a:["Vrai","Faux"],k:0,e:"L’Everest est le sommet le plus élevé au-dessus du niveau moyen de la mer."},
{c:"vraioufaux",d:"moyen",q:"Tous les nombres premiers sont impairs.",a:["Vrai","Faux"],k:1,e:"2 est un nombre premier pair."},
{c:"vraioufaux",d:"difficile",q:"La lumière se déplace moins vite dans l’eau que dans le vide.",a:["Vrai","Faux"],k:0,e:"La vitesse de la lumière est maximale dans le vide."},
{c:"culture",d:"moyen",q:"Combien de couleurs compte traditionnellement l’arc-en-ciel ?",a:["5","6","7","8"],k:2,e:"La représentation traditionnelle distingue sept couleurs."},
{c:"science",d:"facile",q:"Quel est l’organe principal de la respiration chez l’être humain ?",a:["Le cœur","Les poumons","Le foie","L’estomac"],k:1,e:"Les poumons assurent les échanges gazeux respiratoires."},
{c:"geo",d:"difficile",q:"Quel pays possède la plus grande superficie du monde ?",a:["Canada","Chine","États-Unis","Russie"],k:3,e:"La Russie est le plus vaste pays du monde par superficie."},
{c:"math",d:"facile",q:"Combien font 144 ÷ 12 ?",a:["10","11","12","14"],k:2,e:"144 ÷ 12 = 12."},
{c:"histoire",d:"difficile",q:"En quelle année l’Organisation des Nations unies a-t-elle été fondée ?",a:["1919","1939","1945","1955"],k:2,e:"L’ONU a été fondée en 1945."},
  {c:"anime",d:"facile",q:"Dans Naruto, comment s’appelle le démon renard scellé en Naruto ?",a:["Shukaku","Kurama","Gyuki","Matatabi"],k:1,e:"Il s’appelle Kurama, le renard à neuf queues."},
  {c:"anime",d:"facile",q:"Dans One Piece, quel est le rêve de Luffy ?",a:["Devenir Hokage","Devenir Roi des Pirates","Trouver les Dragon Balls","Devenir Amiral"],k:1,e:"Luffy veut devenir le Roi des Pirates."},
  {c:"anime",d:"moyen",q:"Dans Dragon Ball, qui est le père de Gohan ?",a:["Vegeta","Piccolo","Son Goku","Trunks"],k:2,e:"Son Goku est le père de Gohan."},
  {c:"anime",d:"moyen",q:"Dans Demon Slayer, quelle est la sœur de Tanjiro ?",a:["Sakura","Nezuko","Mikasa","Nami"],k:1,e:"Sa sœur s’appelle Nezuko Kamado."},
  {c:"anime",d:"facile",q:"Dans Pokémon, quel est le Pokémon emblématique de Sacha ?",a:["Dracaufeu","Pikachu","Mewtwo","Carapuce"],k:1,e:"Le compagnon emblématique de Sacha est Pikachu."},
  {c:"anime",d:"difficile",q:"Dans L’Attaque des Titans, comment s’appelle la ville natale d’Eren ?",a:["Shiganshina","Trost","Mitras","Liberio"],k:0,e:"Eren vient du district de Shiganshina."},
  {c:"anime",d:"moyen",q:"Dans Jujutsu Kaisen, qui est le professeur aux cheveux blancs ?",a:["Megumi Fushiguro","Kento Nanami","Satoru Gojo","Yuji Itadori"],k:2,e:"Il s’agit de Satoru Gojo."},
  {c:"anime",d:"facile",q:"Dans Naruto, quel est le nom du village de Naruto ?",a:["Konoha","Suna","Kiri","Iwa"],k:0,e:"Naruto vient de Konoha, le village caché de la Feuille."},
  {c:"sons",d:"facile",q:"Quel appareil sert principalement à écouter de la musique sans déranger les autres ?",a:["Un casque audio","Une imprimante","Un clavier","Un routeur"],k:0,e:"Un casque audio permet une écoute individuelle."},
  {c:"sons",d:"moyen",q:"Comment appelle-t-on une personne qui crée et interprète des chansons ?",a:["Un architecte","Un chanteur ou une chanteuse","Un arbitre","Un mécanicien"],k:1,e:"Un chanteur ou une chanteuse interprète des chansons."},
  {c:"sons",d:"facile",q:"Quel instrument possède généralement six cordes ?",a:["La flûte","La guitare","Le tambour","Le piano"],k:1,e:"La guitare possède généralement six cordes."},
  {c:"sons",d:"moyen",q:"Quel terme désigne la vitesse d’un morceau de musique ?",a:["Le tempo","Le décor","Le refrain","Le timbre"],k:0,e:"Le tempo indique la vitesse de la musique."},
  {c:"sons",d:"facile",q:"Comment appelle-t-on la partie qui revient régulièrement dans une chanson ?",a:["Le couplet","Le refrain","L’introduction","Le silence"],k:1,e:"La partie répétée est le refrain."},
  {c:"sons",d:"difficile",q:"Quel instrument est associé aux touches blanches et noires ?",a:["Le piano","La trompette","La batterie","Le violon"],k:0,e:"Le piano possède des touches blanches et noires."},
  {c:"sons",d:"moyen",q:"Quel format audio est connu pour sa compression avec perte ?",a:["WAV","MP3","FLAC sans perte","AIFF non compressé"],k:1,e:"Le MP3 est un format de compression audio avec perte."},
  {c:"sons",d:"facile",q:"Quel élément donne le rythme dans de nombreux groupes de musique ?",a:["La batterie","Le dictionnaire","Le microscope","Le compas"],k:0,e:"La batterie contribue à marquer le rythme."},
  {c:"vie",d:"facile",q:"Quel comportement aide à résoudre un désaccord calmement ?",a:["Écouter l’autre","Crier plus fort","Ignorer tout le monde","Se moquer"],k:0,e:"L’écoute aide à comprendre les points de vue et à dialoguer."},
  {c:"vie",d:"moyen",q:"Quel document présente généralement les expériences et compétences d’une personne qui cherche un emploi ?",a:["Un CV","Une facture","Un ticket","Un menu"],k:0,e:"Le curriculum vitæ présente le parcours et les compétences."},
  {c:"vie",d:"facile",q:"Quel réflexe protège mieux ses comptes en ligne ?",a:["Partager son mot de passe","Utiliser un mot de passe unique et solide","Cliquer sur tous les liens","Publier ses codes"],k:1,e:"Un mot de passe unique et solide réduit les risques d’accès non autorisé."},
  {c:"vie",d:"moyen",q:"Face à une information douteuse sur Internet, que faut-il faire ?",a:["La partager immédiatement","Vérifier plusieurs sources fiables","Croire le premier commentaire","Changer le titre"],k:1,e:"Il faut vérifier l’information auprès de plusieurs sources fiables."},
  {c:"vie",d:"facile",q:"Quelle qualité aide à tenir ses engagements ?",a:["La ponctualité","La distraction","L’impatience","L’oubli volontaire"],k:0,e:"La ponctualité aide à respecter les engagements."},
  {c:"vie",d:"moyen",q:"Quel est un bon premier pas pour organiser un projet ?",a:["Définir un objectif","Tout faire au hasard","Éviter le calendrier","Ne rien noter"],k:0,e:"Un objectif clair aide à planifier les étapes."},
  {c:"vie",d:"facile",q:"Quand quelqu’un te confie un problème, quelle attitude est la plus respectueuse ?",a:["Se moquer","Écouter sans juger","Répandre l’histoire","L’interrompre"],k:1,e:"Écouter sans juger est une attitude respectueuse."},
  {c:"vie",d:"moyen",q:"Pourquoi est-il utile de comparer les prix avant un achat ?",a:["Pour choisir de façon éclairée","Pour acheter le premier produit","Pour oublier son budget","Pour payer deux fois"],k:0,e:"Comparer les prix aide à respecter son budget et à choisir."},
];

const RIDDLES = [
{q:"Je peux être cassé sans être touché. Que suis-je ?",a:["une promesse","promesse"],e:"Une promesse."},
{q:"Plus je sèche, plus je deviens mouillé. Que suis-je ?",a:["une serviette","serviette"],e:"Une serviette."},
{q:"J’ai des dents mais je ne mange pas. Que suis-je ?",a:["un peigne","peigne"],e:"Un peigne."},
{q:"Je monte et je descends sans bouger. Que suis-je ?",a:["un escalier","escalier"],e:"Un escalier."},
{q:"Qu’est-ce qui a des aiguilles mais ne coud pas ?",a:["une horloge","horloge","une montre","montre"],e:"Une horloge ou une montre."}
];
const sessions = new Map();
const numberGames = new Map();
const hangmanGames = new Map();

function norm(value="") {
  return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase()
    .replace(/[’']/g," ").replace(/[^a-z0-9]+/g," ").trim();
}
function sender(message) { return message.key?.participant || message.key?.remoteJid || ""; }
function scores(settings) {
  settings.mheFunGames ||= {scores:{}};
  settings.mheFunGames.scores ||= {};
  return settings.mheFunGames.scores;
}
function award(settings,jid,amount) {
  const all=scores(settings);
  all[jid]=(Number(all[jid])||0)+amount;
  return all[jid];
}
function chooseQuestions(category) {
  const pool=category ? BANK.filter(x=>x.c===category) : BANK;
  return [...pool].sort(()=>Math.random()-0.5).slice(0,10);
}
function renderQuestion(item,index,total) {
  const choices=item.a.map((x,i)=>String.fromCharCode(65+i)+". "+x).join("\n");
  return "╭──〔 👑 M.H.E GOLD QUIZ 〕──╮\nQUESTION "+(index+1)+"/"+total+" • "+item.d.toUpperCase()+"\n\n"+item.q+"\n\n"+choices+"\n\nRéponds par "+(item.a.length===2?"A ou B":"A, B, C ou D")+".\n╰────────────────────╯";
}

export function registerMheFunGames({register,sendText,settings,saveSettings,getPrefix}) {
  const prefix=()=>getPrefix();
  async function startQuiz(chat,category,title) {
    const questions=chooseQuestions(category);
    if(!questions.length) throw new Error("Aucune question disponible dans cette catégorie.");
    sessions.set(chat,{type:"quiz",questions,index:0,startedAt:Date.now()});
    await sendText(chat,"👑 M.H.E-MD GOLD — "+title+"\n10 questions maximum • +10 points par bonne réponse.\nDans un groupe, chaque membre peut participer.\n\n"+renderQuestion(questions[0],0,questions.length));
  }
  register("fun","FUN & GAMES","Afficher le catalogue des jeux",async({chat})=>{
    await sendText(chat,[
      "╔══════ 👑 M.H.E FUN & GAMES ══════╗",
      "QUIZ : .quiz, .culture, .math, .science, .histoire, .geo, .langue, .sport, .logique, .vraioufaux, .capitales",
      "JEUX : .question, .devinette, .enigme, .nombre, .pendu, .rps",
      "SCORES : .quizscore, .topquiz, .points",
      "CONTRÔLE : .quizstop, .nombrestop, .pendustop",
      "DÉTENTE : .blague, .citation, .compliment, .fortune, .de, .piece",
      "╚════════════════════════════════╝",
      "Réponds directement dans le chat. Préfixe : "+prefix()
    ].join("\n"));
  });
  const quizChoices=[
    {key:"anime",cat:"anime",title:"ANIMÉS & MANGAS",emoji:"🍥"},
    {key:"sons",cat:"sons",title:"MUSIQUE & SONS",emoji:"🎵"},
    {key:"vie",cat:"vie",title:"VIE QUOTIDIENNE",emoji:"🌟"},
    {key:"histoire",cat:"histoire",title:"HISTOIRE",emoji:"🏛️"},
    {key:"math",cat:"math",title:"MATHÉMATIQUES",emoji:"➗"},
    {key:"geo",cat:"geo",title:"GÉOGRAPHIE",emoji:"🌍"},
    {key:"science",cat:"science",title:"SCIENCES",emoji:"🔬"},
    {key:"sport",cat:"sport",title:"SPORT",emoji:"🏆"},
    {key:"culture",cat:"culture",title:"CULTURE GÉNÉRALE",emoji:"🧠"},
    {key:"langue",cat:"langue",title:"FRANÇAIS & LANGUES",emoji:"📚"},
    {key:"logique",cat:"logique",title:"LOGIQUE & ÉNIGMES",emoji:"🧩"},
    {key:"vraioufaux",cat:"vraioufaux",title:"VRAI OU FAUX",emoji:"⚖️"},
    {key:"tout",cat:null,title:"TOUT MÉLANGÉ",emoji:"👑"}
  ];
  function showQuizMenu(chat) {
    sessions.set(chat,{type:"quiz-menu",startedAt:Date.now()});
    const lines=quizChoices.map((x,i)=>(i+1)+". "+x.emoji+" "+x.title);
    return sendText(chat,[
      "╔══════ 👑 M.H.E GOLD QUIZ ══════╗",
      "        CHOISIS TON UNIVERS",
      "╠═══════════════════════════════╣",
      ...lines,
      "╠═══════════════════════════════╣",
      "Réponds avec le numéro de ton choix.",
      "Tu peux aussi écrire .quiz anime, .quiz sons ou .quiz tout.",
      "Jusqu’à 10 questions • +10 points par bonne réponse",
      "╚═══════════════════════════════╝"
    ].join("\n"));
  }
  register("quiz","FUN & GAMES","Afficher les catégories de quiz",async({chat,args})=>{
    const key=norm((args||[]).join(" "));
    if(!key) return showQuizMenu(chat);
    const aliases={anime:"anime",animé:"anime",animes:"anime",manga:"anime",mangas:"anime",sons:"sons",son:"sons",musique:"sons",music:"sons",vie:"vie",quotidien:"vie",histoire:"histoire",math:"math",maths:"math",mathematiques:"math",geo:"geo",geographie:"geo",géographie:"geo",science:"science",sciences:"science",sport:"sport",culture:"culture",langue:"langue",francais:"langue",logique:"logique",vraioufaux:"vraioufaux",tout:"tout",mixte:"tout",general:"tout"};
    const selected=quizChoices.find(x=>x.key===aliases[key]);
    if(!selected) return showQuizMenu(chat);
    await startQuiz(chat,selected.cat,selected.title);
  });
  const categories=[
    ["culture","culture","CULTURE GÉNÉRALE"],["math","math","MATHÉMATIQUES"],
    ["science","science","SCIENCES"],["histoire","histoire","HISTOIRE"],
    ["geo","geo","GÉOGRAPHIE"],["langue","langue","FRANÇAIS"],
    ["sport","sport","SPORT"],["logique","logique","LOGIQUE"],
    ["vraioufaux","vraioufaux","VRAI OU FAUX"],["capitales","geo","CAPITALES & GÉOGRAPHIE"],
    ["animequiz","anime","ANIMÉS & MANGAS"],["sonsquiz","sons","MUSIQUE & SONS"],["viequiz","vie","VIE QUOTIDIENNE"]
  ];
  for(const [cmd,cat,title] of categories) register(cmd,"FUN & GAMES","Quiz : "+title,async({chat})=>startQuiz(chat,cat,title));

  for(const cmd of ["question","devinette","enigme"]) register(cmd,"FUN & GAMES","Énigme à réponse libre",async({chat})=>{
    const item=RIDDLES[Math.floor(Math.random()*RIDDLES.length)];
    sessions.set(chat,{type:"open",item,startedAt:Date.now()});
    await sendText(chat,"🧠 "+cmd.toUpperCase()+" M.H.E\n\n"+item.q+"\n\nÉcris ta réponse directement ici.");
  });
  register("quizstop","FUN & GAMES","Arrêter le quiz actif",async({chat})=>{
    if(!sessions.delete(chat)) throw new Error("Aucun quiz ou énigme actif ici.");
    await sendText(chat,"🛑 Partie arrêtée. Les points déjà gagnés sont conservés.");
  });
  register("quizscore","FUN & GAMES","Afficher son score",async({chat,actor})=>{
    await sendText(chat,"🏅 TON SCORE M.H.E GOLD\n\n"+(Number(scores(settings)[actor])||0)+" point(s) cumulés.");
  });
  register("points","FUN & GAMES","Afficher ses points",async({chat,actor})=>{
    await sendText(chat,"👑 Tu possèdes "+(Number(scores(settings)[actor])||0)+" point(s) M.H.E GOLD.");
  });
  register("topquiz","FUN & GAMES","Classement des joueurs",async({chat})=>{
    const top=Object.entries(scores(settings)).filter(([,v])=>Number(v)>0).sort((a,b)=>Number(b[1])-Number(a[1])).slice(0,10);
    if(!top.length) return sendText(chat,"🏆 Classement vide. Lance .quiz pour gagner les premiers points.");
    const lines=top.map(([jid,pts],i)=>(["🥇","🥈","🥉"][i]||String(i+1)+".")+" @"+jid.split("@")[0].split(":")[0]+" — "+pts+" pts");
    await sendText(chat,"╭──〔 🏆 TOP M.H.E FUN 〕──╮\n"+lines.join("\n")+"\n╰────────────────────╯",{mentions:top.map(x=>x[0])});
  });

  register("nombre","FUN & GAMES","Jeu du nombre mystère de 1 à 20",async({chat})=>{
    numberGames.set(chat,{target:1+Math.floor(Math.random()*20),attempts:0,expires:Date.now()+120000});
    await sendText(chat,"🔢 NOMBRE MYSTÈRE\n\nJ’ai choisi un nombre entre 1 et 20. Envoie un nombre pour deviner. Tu as 2 minutes !");
  });
  register("nombrestop","FUN & GAMES","Arrêter le nombre mystère",async({chat})=>{
    if(!numberGames.delete(chat)) throw new Error("Aucun nombre mystère actif.");
    await sendText(chat,"🛑 Jeu du nombre arrêté.");
  });
  register("pendu","FUN & GAMES","Lancer le jeu du pendu",async({chat})=>{
    const words=["brazzaville","ordinateur","elephant","papillon","montagne","chocolat","musique","football"];
    const word=words[Math.floor(Math.random()*words.length)];
    hangmanGames.set(chat,{word,letters:[],left:7,expires:Date.now()+180000});
    await sendText(chat,"🔤 JEU DU PENDU\n\nMot : "+word.replace(/[a-z]/g,"＿")+"\n7 erreurs maximum. Envoie une lettre ou le mot complet.");
  });
  register("pendustop","FUN & GAMES","Arrêter le pendu",async({chat})=>{
    if(!hangmanGames.delete(chat)) throw new Error("Aucune partie de pendu active.");
    await sendText(chat,"🛑 Partie de pendu arrêtée.");
  });
  register("rps","FUN & GAMES","Pierre, feuille, ciseaux",async({chat,actor,args})=>{
    const choice=norm(args[0]||"");
    const values=["pierre","feuille","ciseaux"];
    if(!values.includes(choice)) throw new Error("Utilise "+prefix()+"rps pierre, feuille ou ciseaux.");
    const bot=Math.floor(Math.random()*3), user=values.indexOf(choice);
    const result=user===bot?"Égalité !":((user-bot+3)%3===1?"Tu gagnes !":"M.H.E gagne cette manche !");
    if(result==="Tu gagnes !") award(settings,actor,5);
    await saveSettings();
    await sendText(chat,"✊ PIERRE • FEUILLE • CISEAUX\n\nToi : "+choice+"\nM.H.E : "+values[bot]+"\n\n"+result+(result==="Tu gagnes !"?"\n+5 points.":""));
  });
  register("blague","FUN & GAMES","Raconter une blague",async({chat})=>{
    const list=["Pourquoi les plongeurs plongent-ils en arrière ? Parce que sinon ils tombent dans le bateau !","Quel est le comble pour un électricien ? Ne pas être au courant.","Pourquoi les livres ont-ils froid ? Parce qu’ils ont une couverture.","Que dit un zéro à un huit ? Belle ceinture !"];
    await sendText(chat,"😂 "+list[Math.floor(Math.random()*list.length)]);
  });
  register("citation","FUN & GAMES","Citation positive",async({chat})=>{
    const list=["Le savoir grandit quand on le partage.","Chaque progrès commence par une décision.","La patience transforme les efforts en résultats.","Apprends aujourd’hui pour construire demain."];
    await sendText(chat,"✦ "+list[Math.floor(Math.random()*list.length)]);
  });
  register("compliment","FUN & GAMES","Compliment amical",async({chat})=>{
    const list=["Ta curiosité est une vraie force.","Continue d’avancer : tes efforts comptent.","Tu apportes une bonne ambiance ici.","Ton énergie positive fait du bien au groupe."];
    await sendText(chat,"🌟 "+list[Math.floor(Math.random()*list.length)]);
  });
  register("fortune","FUN & GAMES","Prédiction amusante non sérieuse",async({chat})=>{
    const list=["Une bonne surprise pourrait égayer ta journée.","Une nouvelle idée mérite ton attention.","Un petit effort aujourd’hui peut ouvrir une belle possibilité.","Garde l’esprit curieux : une occasion peut se présenter."];
    await sendText(chat,"🔮 Message amusant : "+list[Math.floor(Math.random()*list.length)]+"\nPour le divertissement uniquement.");
  });
  register("de","FUN & GAMES","Lancer un dé",async({chat})=>sendText(chat,"🎲 Résultat : "+(1+Math.floor(Math.random()*6))));
  register("piece","FUN & GAMES","Lancer une pièce",async({chat})=>sendText(chat,"🪙 Résultat : "+(Math.random()<0.5?"Pile":"Face")));

  async function handleIncoming(message) {
    const chat=message.key?.remoteJid||"", actor=sender(message);
    const body=message.message||{};
    const text=(body.conversation||body.extendedTextMessage?.text||body.imageMessage?.caption||body.videoMessage?.caption||"").trim();
    if(!text||text.startsWith(prefix())||message.key?.fromMe) return false;
    const number=numberGames.get(chat);
    if(number) {
      if(Date.now()>number.expires) { numberGames.delete(chat); await sendText(chat,"⌛ Temps écoulé ! Relance avec .nombre."); return true; }
      if(!/^\d{1,2}$/.test(text)) return false;
      const guess=Number(text); if(guess<1||guess>20) return false;
      number.attempts++;
      if(guess===number.target) {
        numberGames.delete(chat); const total=award(settings,actor,15); await saveSettings();
        await sendText(chat,"🎉 Bravo @"+actor.split("@")[0]+" ! Tu as trouvé "+guess+" en "+number.attempts+" tentative(s).\n+15 points • Total : "+total+" pts.",{mentions:[actor]});
      } else await sendText(chat,guess<number.target?"⬆️ C’est plus grand !":"⬇️ C’est plus petit !");
      return true;
    }
    const hang=hangmanGames.get(chat);
    if(hang) {
      if(Date.now()>hang.expires) { hangmanGames.delete(chat); await sendText(chat,"⌛ Temps écoulé ! Le mot était : "+hang.word+"."); return true; }
      const guess=norm(text).replace(/\s/g,"");
      if(!/^[a-z]$/.test(guess)&&guess!==hang.word) return false;
      if(guess===hang.word) {
        hangmanGames.delete(chat); const total=award(settings,actor,15); await saveSettings();
        await sendText(chat,"🏆 Mot trouvé : "+hang.word+" ! +15 points (total "+total+")."); return true;
      }
      if(hang.letters.includes(guess)) { await sendText(chat,"Lettre déjà proposée : "+hang.letters.join(", ")); return true; }
      hang.letters.push(guess); if(!hang.word.includes(guess)) hang.left--;
      const shown=[...hang.word].map(ch=>hang.letters.includes(ch)?ch:"＿").join(" ");
      if(hang.left<=0) { hangmanGames.delete(chat); await sendText(chat,"Fin de partie ! Le mot était : "+hang.word+"."); }
      else if(!shown.includes("＿")) { hangmanGames.delete(chat); const total=award(settings,actor,15); await saveSettings(); await sendText(chat,"🎉 Mot découvert : "+shown+"\n+15 points (total "+total+")."); }
      else await sendText(chat,"🔤 "+shown+"\nErreurs restantes : "+hang.left+"\nLettres : "+hang.letters.join(", "));
      return true;
    }
    const session=sessions.get(chat);
    if(!session) return false;
    if(Date.now()-session.startedAt>15*60_000) { sessions.delete(chat); await sendText(chat,"⌛ Cette partie a expiré. Relance avec .quiz."); return true; }
    if(session.type==="quiz-menu") {
      const selectedIndex=/^\d{1,2}$/.test(text)?Number(text)-1:-1;
      const key=norm(text);
      const selected=selectedIndex>=0?quizChoices[selectedIndex]:quizChoices.find(x=>norm(x.key)===key||norm(x.title)===key);
      if(!selected) { await sendText(chat,"Choix non reconnu. Réponds avec un numéro de 1 à "+quizChoices.length+" ou relance .quiz."); return true; }
      await startQuiz(chat,selected.cat,selected.title);
      return true;
    }
    if(session.type==="open") {
      const answer=norm(text);
      if(!session.item.a.some(x=>norm(x)===answer)) { await sendText(chat,"❌ Pas tout à fait. Essaie encore, ou utilise .quizstop."); return true; }
      sessions.delete(chat); const total=award(settings,actor,10); await saveSettings();
      await sendText(chat,"✅ Bonne réponse @"+actor.split("@")[0]+" !\n"+session.item.e+"\n+10 points • Total : "+total+" pts.",{mentions:[actor]});
      return true;
    }
    const item=session.questions[session.index], answer=norm(text);
    const letter=/^[a-d]$/i.test(text)?text.toUpperCase().charCodeAt(0)-65:-1;
    const numeric=/^[1-4]$/.test(text)?Number(text)-1:-1;
    const selected=letter>=0?letter:numeric>=0?numeric:item.a.findIndex(x=>norm(x)===answer);
    if(selected<0) return false;
    const correct=selected===item.k;
    const total=correct?award(settings,actor,10):(Number(scores(settings)[actor])||0);
    session.index++;
    const end=session.index>=session.questions.length;
    await saveSettings();
    const result=correct?"✅ Bonne réponse @"+actor.split("@")[0]+" ! +10 points.":"❌ Mauvaise réponse @"+actor.split("@")[0]+". La bonne réponse était : "+item.a[item.k]+".";
    if(end) {
      sessions.delete(chat);
      await sendText(chat,result+"\n"+item.e+"\n\n🏁 QUIZ TERMINÉ !\nScore cumulé du joueur : "+total+" points.\nUtilise .topquiz pour le classement.",{mentions:[actor]});
    } else {
      await sendText(chat,result+"\n"+item.e+"\n\n"+renderQuestion(session.questions[session.index],session.index,session.questions.length),{mentions:[actor]});
    }
    return true;
  }
  return {handleIncoming};
}
