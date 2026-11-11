import test from "node:test";
import assert from "node:assert/strict";
import { registerMheFunGames } from "../core/mhe-fun-games.js";

function setup() {
  const commands=new Map(), sent=[], settings={};
  const register=(name,category,description,handler)=>commands.set(name,{name,category,description,handler});
  const game=registerMheFunGames({register,sendText:async(chat,text,options={})=>sent.push({chat,text,options}),settings,saveSettings:async()=>{},getPrefix:()=>"."});
  return {commands,sent,settings,game};
}
test("registers the fun catalogue, quiz categories, games and scores",()=>{
  const {commands}=setup();
  for(const name of ["fun","quiz","culture","math","science","histoire","geo","langue","sport","logique","vraioufaux","capitales","animequiz","sonsquiz","viequiz","devinette","enigme","quizstop","quizscore","topquiz","points","nombre","pendu","rps","blague","citation","compliment","fortune"]) assert.ok(commands.has(name),name);
});
test("bare .quiz displays categories and a numeric choice launches the selected quiz",async()=>{
  const {commands,sent,game}=setup();
  await commands.get("quiz").handler({chat:"p@s.whatsapp.net",args:[]});
  assert.match(sent[0].text,/CHOISIS TON UNIVERS/);
  assert.match(sent[0].text,/ANIMÉS & MANGAS/);
  assert.match(sent[0].text,/MUSIQUE & SONS/);
  const result=await game.handleIncoming({key:{remoteJid:"p@s.whatsapp.net",participant:"p@s.whatsapp.net",fromMe:false},message:{conversation:"1"}});
  assert.equal(result,true);
  assert.match(sent.at(-1).text,/ANIMÉS & MANGAS/);
  assert.match(sent.at(-1).text,/QUESTION 1/);
});
test(".quiz sons starts the music quiz directly",async()=>{
  const {commands,sent}=setup();
  await commands.get("quiz").handler({chat:"p@s.whatsapp.net",args:["sons"]});
  assert.match(sent.at(-1).text,/MUSIQUE & SONS/);
  assert.match(sent.at(-1).text,/QUESTION 1/);
});
test("ignores unrelated text when no game is active",async()=>{
  const {game}=setup();
  const result=await game.handleIncoming({key:{remoteJid:"p@s.whatsapp.net",fromMe:false},message:{conversation:"Bonjour"}});
  assert.equal(result,false);
});
