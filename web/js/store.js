// Local-only persistence. Nothing personal leaves the device except what the user sends to the AI.
const K = {
  profile: 'pp.profile', progress: 'pp.progress', custom: 'pp.customTopics',
  privatePacks: 'pp.privatePacks', chat: 'pp.chat', clientId: 'pp.clientId', access: 'pp.accessCode', speak: 'pp.speak',
  session: 'pp.session', account: 'pp.account', liveSettings: 'pp.liveSettings',
  suggestAsked: 'pp.suggestAsked', lastProvider: 'pp.lastProvider',
  nudgeIndex: 'pp.nudgeIndex', nudgeDay: 'pp.nudgeDay', notifAsked: 'pp.notifAsked',
  activity: 'pp.activity', chats: 'pp.chats', chatCur: 'pp.chatCur',
};

const MAX_CHATS = 30, MAX_MSGS = 120;
const chatTitle = msgs => { const u = msgs.find(m => m.role === 'user' && m.content !== '🎙 …'); return (u?.content || 'Voice session').replace(/\s+/g, ' ').slice(0, 60); };
const read = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { alert('Storage is full: ' + e.message); } };

export const store = {
  profile: () => read(K.profile, null),
  setProfile: p => { write(K.profile, p); store.onUserData?.(); },
  progress: () => read(K.progress, {}),
  setProgress: p => { write(K.progress, p); store.onUserData?.(); },
  customTopics: () => read(K.custom, []),
  setCustomTopics: t => write(K.custom, t),
  privatePacks: () => read(K.privatePacks, []),
  setPrivatePacks: p => write(K.privatePacks, p),
  // Conversations: [{ id, title, at, msgs }], newest first. chat()/setChat() read and write the
  // current one, so the rest of the app works with a single list of messages.
  chats: () => {
    let list = read(K.chats, null);
    if (!list) { // first run: the old single chat becomes the first conversation
      const old = read(K.chat, []);
      list = old.length ? [{ id: 'c' + Date.now(), title: chatTitle(old), at: Date.now(), msgs: old }] : [];
      write(K.chats, list);
    }
    return list;
  },
  setChats: list => write(K.chats, list.slice(0, MAX_CHATS)),
  chatCur: () => read(K.chatCur, ''),
  setChatCur: id => write(K.chatCur, id),
  chat: () => { const id = store.chatCur(); return store.chats().find(c => c.id === id)?.msgs || []; },
  setChat: msgs => {
    const list = store.chats();
    let id = store.chatCur(), c = list.find(x => x.id === id);
    if (!c) { if (!msgs.length) return; c = { id: 'c' + Date.now(), msgs: [] }; list.unshift(c); store.setChatCur(c.id); }
    c.msgs = msgs.slice(-MAX_MSGS); c.at = Date.now(); c.title = chatTitle(c.msgs);
    store.setChats([c, ...list.filter(x => x !== c)].filter(x => x.msgs.length));
  },
  newChat: () => store.setChatCur(''),
  deleteChat: id => { store.setChats(store.chats().filter(c => c.id !== id)); if (store.chatCur() === id) store.setChatCur(''); },
  accessCode: () => read(K.access, ''),
  setAccessCode: c => write(K.access, c),
  speak: () => read(K.speak, false),
  setSpeak: v => write(K.speak, v),
  session: () => read(K.session, ''),
  setSession: t => write(K.session, t),
  account: () => read(K.account, null),
  setAccount: a => write(K.account, a),
  liveSettings: () => read(K.liveSettings, null),
  setLiveSettings: s => write(K.liveSettings, s),
  suggestAsked: () => read(K.suggestAsked, false),
  setSuggestAsked: v => write(K.suggestAsked, v),
  lastProvider: () => read(K.lastProvider, ''),
  setLastProvider: p => write(K.lastProvider, p),
  nudgeIndex: () => read(K.nudgeIndex, 0),
  setNudgeIndex: i => write(K.nudgeIndex, i),
  nudgeDay: () => read(K.nudgeDay, ''),
  setNudgeDay: d => write(K.nudgeDay, d),
  notifAsked: () => read(K.notifAsked, false),
  setNotifAsked: v => write(K.notifAsked, v),
  activity: () => read(K.activity, {}),
  setActivity: a => write(K.activity, a),
  clientId() {
    let id = read(K.clientId, null);
    if (!id) { id = crypto.randomUUID(); write(K.clientId, id); }
    return id;
  },
  resetAll() { Object.values(K).forEach(k => localStorage.removeItem(k)); },
  // Sign out: remove everything personal so the next person starts fresh. Device settings
  // (text size, card mode, install id) stay.
  clearUser() {
    const personal = [K.profile, K.progress, K.custom, K.privatePacks, K.chat, K.chats, K.chatCur, K.liveSettings, K.activity, K.access,
      'pp.jobs', 'pp.jobfocus', 'pp.resume', 'pp.newTopics', 'pp.freeCards', 'pp.pipAuto', 'pp.pipSpeed', 'pp.profileGuest'];
    personal.forEach(k => { try { localStorage.removeItem(k); } catch { /* blocked */ } });
  },
};
