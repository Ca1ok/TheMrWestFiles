// Widget: unread messages (links to Messages).
(window.__OSW = window.__OSW || []).push({ id: 'messages', name: 'Messages', app: 'Messages', desc: 'Unread count and the latest message.', sizes: ['xs', 'h', 'v', 's', 'x3', 'b', 'm'], on: ['mail'],
  mount(el, size, c){
    el.innerHTML = '<div class="wh">' + c.tile('Messages') + '<span>Messages</span></div><div class="grow"></div><div class="big" data-n>0</div><div class="sub" data-s style="display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden">&nbsp;</div>';
    const N = el.querySelector('[data-n]'), S = el.querySelector('[data-s]');
    function paint(){ const m = c.OS.mail.list(), u = c.OS.mail.unread(); N.textContent = u ? u + (u === 1 ? ' new' : ' new') : 'All read'; S.textContent = m.length ? m[0].from + ': ' + m[0].subj : 'No messages'; }
    paint(); return { update: paint };
  } });
