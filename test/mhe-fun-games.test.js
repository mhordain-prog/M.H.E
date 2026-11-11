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
  for(const name of ["fun","quiz","culture","math","science","histoire","geo","langue","sport","logique","vraioufaux","capitales","devinette","enigme","quizstop","quizscore","topquiz","points","nombre","pendu","rps","blague","citation","compliment","fortune"]) assert.ok(commands.has(name),name);
});
test("starts a quiz and handles an answer",async()=>{
  const {commands,sent,game,settings}=setup();
  await commands.get("quiz").handler({chat:"p@s.whatsapp.net"});
  assert.match(sent[0].text,/QUESTION 1\/10/);
  const options=sent[0].text.match(/\nA\. ([^\n]+)\nB\. ([^\n]+)\nC\. ([^\n]+)\nD\. ([^\n]+)/);
  assert.ok(options);
  const result=await game.handleIncoming({key:{remoteJid:"p@s.whatsapp.net",participant:"p@s.whatsapp.net",fromMe:false},message:{conversation:options[1]}});
  assert.equal(result,true);
  assert.ok(settings.mheFunGames);
});
test("ignores unrelated text when no game is active",async()=>{
  const {game}=setup();
  const result=await game.handleIncoming({key:{remoteJid:"p@s.whatsapp.net",fromMe:false},message:{conversation:"Bonjour"}});
  assert.equal(result,false);
});
