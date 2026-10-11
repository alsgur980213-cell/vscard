(() => {
  'use strict';

  const byId = (id) => document.getElementById(id);
  const dataNode = byId('profile-data');
  if (!dataNode) return;

  let stored;
  try {
    stored = JSON.parse(dataNode.textContent || '{}');
  } catch (error) {
    console.error('프로필 데이터를 읽지 못했습니다.', error);
    return;
  }

  const profile = {
    name: String(stored.name || ''),
    role: String(stored.role || ''),
    email: String(stored.email || '').trim(),
    phone: String(stored.phone || '').trim(),
    photo: typeof stored.photo === 'string' &&
      /^(?:data:image\/(?:jpeg|png|webp|gif|avif);base64,|https:\/\/pixabay\.com\/images\/download\/x-323262_1920\.jpg$)/.test(stored.photo)
        ? stored.photo
        : ''
  };

  let toastTimer = null;

  // 기존 카드 호버 및 이메일 복사 알림 스타일 유지.
  function installInteractionStyles() {
    if (byId('business-card-interaction-styles')) return;
    const style = document.createElement('style');
    style.id = 'business-card-interaction-styles';
    style.textContent = `
      @media (hover: hover) and (pointer: fine) {
        .card {
          transition: transform 280ms cubic-bezier(.2, .7, .2, 1),
                      box-shadow 280ms cubic-bezier(.2, .7, .2, 1);
        }
        .card:hover {
          transform: translateY(-8px);
          box-shadow: 0 36px 110px rgba(0, 0, 0, .48),
                      inset 0 1px 0 rgba(255, 255, 255, .06);
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .card { transition: none !important; }
      }
      #copy-toast {
        position: fixed;
        left: 50%;
        bottom: 28px;
        z-index: 9999;
        max-width: calc(100vw - 32px);
        padding: 12px 20px;
        border: 1px solid #dde2f2;
        border-radius: 12px;
        background: #1b234a;
        color: #f6f7ff;
        box-shadow: 0 12px 35px rgba(0, 0, 0, .3);
        font-size: 13px;
        font-weight: 600;
        text-align: center;
        pointer-events: none;
        opacity: 0;
        transform: translate(-50%, 12px);
        transition: opacity 180ms ease, transform 180ms ease;
      }
      #copy-toast.is-visible {
        opacity: 1;
        transform: translate(-50%, 0);
      }
      @media (prefers-reduced-motion: reduce) {
        #copy-toast { transition: none !important; }
      }
    `;
    document.head.appendChild(style);
  }

  function notify(message) {
    const announce = byId('announce');
    if (announce) announce.textContent = message;

    let toast = byId('copy-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'copy-toast';
      toast.setAttribute('aria-hidden', 'true');
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('is-visible');
    if (toastTimer !== null) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove('is-visible');
      toastTimer = null;
    }, 2200);
  }

  // 보안 컨텍스트가 아닌 file:// 실행 환경에서도 클립보드 복사를 시도합니다.
  function fallbackCopy(text) {
    const textarea = document.createElement('textarea');
    const previousFocus = document.activeElement;
    textarea.value = text;
    textarea.readOnly = true;
    textarea.setAttribute('aria-hidden', 'true');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    let copied = false;
    try {
      textarea.focus();
      textarea.select();
      textarea.setSelectionRange(0, text.length);
      copied = Boolean(document.execCommand('copy'));
    } catch (error) {
      copied = false;
    } finally {
      textarea.remove();
      if (previousFocus && typeof previousFocus.focus === 'function') {
        previousFocus.focus({ preventScroll: true });
      }
    }
    return copied;
  }

  // 연락처 전체 행에 연결하는 공통 클립보드 복사 기능.
  // 브라우저 보안 정책상 호버만으로 자동 복사는 할 수 없어, 클릭 시 복사합니다.
  async function copyContact(value, label) {
    if (!value) return;
    let copied = false;
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      try {
        await navigator.clipboard.writeText(value);
        copied = true;
      } catch (error) {
        // 클립보드 권한이 없으면 execCommand를 사용해 대체 복사를 시도합니다.
      }
    }
    if (!copied) copied = fallbackCopy(value);
    notify(copied
      ? label + '가 복사되었습니다.'
      : '자동 복사에 실패했습니다. ' + label + '를 직접 복사해 주세요.');
  }

  function updateContactRow(rowId, valueId, value, emptyLabel, accessibleLabel) {
    const row = byId(rowId);
    const text = byId(valueId);
    if (!row || !text) return;
    text.textContent = value || emptyLabel;
    text.classList.toggle('is-empty', !value);
    row.disabled = !value;
    row.setAttribute('aria-label', value
      ? accessibleLabel + ': ' + value
      : emptyLabel);
  }

  function renderProfile() {
    byId('display-name').textContent = profile.name || '이름';
    byId('display-role').textContent = profile.role || '직군';
    byId('avatar-initial').textContent = [...profile.name.trim()][0] || '?';

    const avatar = byId('avatar-image');
    const hasPhoto = Boolean(profile.photo);
    avatar.hidden = !hasPhoto;
    byId('avatar-initial').hidden = hasPhoto;
    avatar.alt = (profile.name || '사용자') + '의 프로필 사진';
    if (hasPhoto) avatar.src = profile.photo;
    else avatar.removeAttribute('src');

    updateContactRow('email-copy-row', 'email-link', profile.email,
      '이메일 정보 없음', '이메일 주소 복사');
    updateContactRow('phone-copy-row', 'phone-link', profile.phone,
      '전화번호 정보 없음', '전화번호 복사');

    const emailButton = byId('email-button');
    if (profile.email) {
      emailButton.href = 'mailto:' + profile.email;
      emailButton.removeAttribute('aria-disabled');
      emailButton.removeAttribute('tabindex');
    } else {
      emailButton.removeAttribute('href');
      emailButton.setAttribute('aria-disabled', 'true');
      emailButton.setAttribute('tabindex', '-1');
    }
    document.title = profile.name
      ? profile.name + ' | Digital Business Card'
      : 'Digital Business Card';
  }

  function saveBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function safeFileName(name) {
    return (name || 'business-card')
      .replace(/[\\/:*?"<>|\x00-\x1F]/g, '')
      .trim().slice(0, 60) || 'business-card';
  }

  function escapeVcard(value) {
    return String(value)
      .replace(/\\/g, '\\\\')
      .replace(/\r?\n/g, '\\n')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,');
  }

  function downloadVcard() {
    const lines = ['BEGIN:VCARD', 'VERSION:3.0', 'FN:' + escapeVcard(profile.name)];
    if (profile.role) lines.push('TITLE:' + escapeVcard(profile.role));
    if (profile.email) lines.push('EMAIL;TYPE=INTERNET:' + escapeVcard(profile.email));
    if (profile.phone) lines.push('TEL;TYPE=CELL:' + escapeVcard(profile.phone));
    lines.push('END:VCARD');
    saveBlob(
      new Blob(['\ufeff' + lines.join('\r\n') + '\r\n'], {type: 'text/vcard;charset=utf-8'}),
      safeFileName(profile.name) + '.vcf'
    );
  }

  const avatar = byId('avatar-image');
  avatar.addEventListener('error', () => {
    avatar.hidden = true;
    byId('avatar-initial').hidden = false;
  });

  byId('email-copy-row').addEventListener('click', () => copyContact(profile.email, '이메일 주소'));
  byId('phone-copy-row').addEventListener('click', () => copyContact(profile.phone, '전화번호'));
  byId('download-vcard').addEventListener('click', downloadVcard);
  installInteractionStyles();
  renderProfile();
})();
