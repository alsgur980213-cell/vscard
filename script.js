(() => {
  'use strict';

  // 프로필 데이터는 HTML의 #profile-data에서 읽습니다.
  const byId = (id) => document.getElementById(id);
  const profileDataElement = byId('profile-data');
  const stored = JSON.parse(profileDataElement.textContent);
  const profile = {
    name: String(stored.name || ''),
    role: String(stored.role || ''),
    email: String(stored.email || ''),
    phone: String(stored.phone || ''),
    photo:
      typeof stored.photo === 'string' &&
      /^(?:data:image\/(?:jpeg|png|webp|gif|avif);base64,|https:\/\/pixabay\.com\/images\/download\/x-323262_1920\.jpg$)/.test(stored.photo)
        ? stored.photo
        : ''
  };

  const dialog = byId('editor-dialog');
  const form = byId('editor-form');
  const photoInput = byId('field-photo');
  const photoNote = byId('photo-note');
  const applyButton = byId('apply-editor');
  let pendingPhoto = null;
  let readingPhoto = false;
  let toastTimer = null;

  // style.css를 수정하지 않고 JS에서 카드 호버 애니메이션과 알림 스타일을 추가합니다.
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
      #email-link:not(.is-empty) { cursor: copy; }
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

  // 화면에 짧게 표시하고, 스크린리더에는 기존 #announce를 이용해 안내합니다.
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

  // file:// 등 Clipboard API를 사용할 수 없는 환경을 위한 대체 복사 방법입니다.
  function fallbackCopy(text) {
    const textarea = document.createElement('textarea');
    const previousFocus = document.activeElement;
    textarea.value = text;
    textarea.readOnly = true;
    textarea.setAttribute('aria-hidden', 'true');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '0';
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

  // 표시된 이메일 주소를 클릭했을 때 클립보드에 복사합니다.
  // 하단 이메일 버튼(#email-button)은 기존처럼 메일 작성 기능을 유지합니다.
  async function copyEmail(event) {
    event.preventDefault();
    const email = profile.email.trim();
    if (!email) return;

    let copied = false;
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      try {
        await navigator.clipboard.writeText(email);
        copied = true;
      } catch (error) {
        // 권한 거부, 비보안 환경 등에서는 대체 복사를 시도합니다.
      }
    }

    if (!copied) copied = fallbackCopy(email);
    notify(copied ? '이메일 주소가 복사되었습니다.' : '자동 복사에 실패했습니다. 이메일 주소를 직접 복사해 주세요.');
  }

  byId('avatar-image').addEventListener('error', () => {
    byId('avatar-image').hidden = true;
    byId('avatar-initial').hidden = false;
  });

  function setLink(node, value, href, emptyLabel) {
    const hasValue = Boolean(value.trim());
    node.textContent = hasValue ? value : emptyLabel;
    node.classList.toggle('is-empty', !hasValue);
    if (hasValue) {
      node.setAttribute('href', href);
      node.removeAttribute('aria-disabled');
      node.removeAttribute('tabindex');
    } else {
      node.removeAttribute('href');
      node.setAttribute('aria-disabled', 'true');
      node.setAttribute('tabindex', '-1');
    }
  }

  function renderProfile() {
    byId('display-name').textContent = profile.name || '이름';
    byId('display-role').textContent = profile.role || '직군을 입력해 주세요';
    byId('avatar-initial').textContent = [...profile.name.trim()][0] || '?';

    const avatar = byId('avatar-image');
    const hasPhoto = Boolean(profile.photo);
    avatar.hidden = !hasPhoto;
    byId('avatar-initial').hidden = hasPhoto;
    if (hasPhoto) avatar.src = profile.photo;
    else avatar.removeAttribute('src');
    avatar.alt = (profile.name || '사용자') + '의 프로필 사진';

    const emailLink = byId('email-link');
    setLink(emailLink, profile.email, 'mailto:' + profile.email, '이메일을 등록해 주세요');
    if (profile.email.trim()) {
      emailLink.title = '클릭하여 이메일 주소 복사';
      emailLink.setAttribute('aria-label', '이메일 주소 복사: ' + profile.email.trim());
    } else {
      emailLink.removeAttribute('title');
      emailLink.removeAttribute('aria-label');
    }

    setLink(
      byId('phone-link'),
      profile.phone,
      'tel:' + profile.phone.replace(/[^\d+]/g, ''),
      '전화번호를 등록해 주세요'
    );

    const emailButton = byId('email-button');
    if (profile.email.trim()) {
      emailButton.href = 'mailto:' + profile.email.trim();
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

  function openEditor() {
    byId('field-name').value = profile.name;
    byId('field-role').value = profile.role;
    byId('field-email').value = profile.email;
    byId('field-phone').value = profile.phone;
    photoInput.value = '';
    pendingPhoto = null;
    photoNote.textContent = profile.photo
      ? '현재 프로필 사진이 등록되어 있습니다.'
      : 'JPG, PNG, WebP 등 · 최대 15MB · 자동 정사각형 크롭';
    byId('remove-photo').hidden = !profile.photo;
    dialog.showModal();
  }

  async function compressImage(file) {
    if (!file || !/^image\/(jpeg|png|webp|gif|avif)$/.test(file.type)) {
      throw new Error('JPG, PNG, WebP, GIF 또는 AVIF 이미지를 선택해 주세요.');
    }
    if (file.size > 15 * 1024 * 1024) {
      throw new Error('15MB 이하의 이미지를 선택해 주세요.');
    }

    const objectURL = URL.createObjectURL(file);
    try {
      const picture = new Image();
      picture.src = objectURL;
      await new Promise((resolve, reject) => {
        picture.onload = resolve;
        picture.onerror = () => reject(new Error('이미지를 읽지 못했습니다. 다른 파일을 사용해 주세요.'));
      });

      const side = 600;
      const crop = Math.min(picture.naturalWidth, picture.naturalHeight);
      if (!crop) throw new Error('올바른 이미지 파일이 아닙니다.');
      const x = (picture.naturalWidth - crop) / 2;
      const y = (picture.naturalHeight - crop) / 2;
      const canvas = document.createElement('canvas');
      canvas.width = side;
      canvas.height = side;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('이 브라우저에서 이미지 변환을 지원하지 않습니다.');
      context.fillStyle = '#262a32';
      context.fillRect(0, 0, side, side);
      context.drawImage(picture, x, y, crop, crop, 0, 0, side, side);
      return canvas.toDataURL('image/jpeg', 0.86);
    } finally {
      URL.revokeObjectURL(objectURL);
    }
  }

  photoInput.addEventListener('change', async () => {
    const file = photoInput.files && photoInput.files[0];
    if (!file) return;

    readingPhoto = true;
    applyButton.disabled = true;
    photoNote.textContent = '이미지를 최적화하는 중입니다…';
    try {
      pendingPhoto = await compressImage(file);
      photoNote.textContent = '사진 준비 완료 · 변경 적용을 눌러 반영하세요.';
      byId('remove-photo').hidden = false;
    } catch (error) {
      pendingPhoto = null;
      photoInput.value = '';
      photoNote.textContent = error.message;
    } finally {
      readingPhoto = false;
      applyButton.disabled = false;
    }
  });

  byId('remove-photo').addEventListener('click', () => {
    pendingPhoto = '';
    photoInput.value = '';
    photoNote.textContent = '사진이 제거됩니다. 변경 적용을 눌러 반영하세요.';
    byId('remove-photo').hidden = true;
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (readingPhoto || !form.reportValidity()) return;
    profile.name = byId('field-name').value.trim();
    profile.role = byId('field-role').value.trim();
    profile.email = byId('field-email').value.trim();
    profile.phone = byId('field-phone').value.trim();
    if (pendingPhoto !== null) profile.photo = pendingPhoto;
    renderProfile();
    dialog.close();
    byId('announce').textContent = '프로필이 수정되었습니다. HTML 파일 저장 버튼으로 파일에 반영하세요.';
  });

  byId('avatar-button').addEventListener('click', openEditor);
  byId('open-editor').addEventListener('click', openEditor);
  byId('close-editor').addEventListener('click', () => dialog.close());
  byId('cancel-editor').addEventListener('click', () => dialog.close());
  byId('email-link').addEventListener('click', copyEmail);

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
      .trim()
      .slice(0, 60) || 'business-card';
  }

  function escapeVcard(value) {
    return String(value)
      .replace(/\\/g, '\\\\')
      .replace(/\r?\n/g, '\\n')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,');
  }

  byId('download-vcard').addEventListener('click', () => {
    const lines = ['BEGIN:VCARD', 'VERSION:3.0', 'FN:' + escapeVcard(profile.name)];
    if (profile.role) lines.push('TITLE:' + escapeVcard(profile.role));
    if (profile.email) lines.push('EMAIL;TYPE=INTERNET:' + escapeVcard(profile.email));
    if (profile.phone) lines.push('TEL;TYPE=CELL:' + escapeVcard(profile.phone));
    lines.push('END:VCARD');
    saveBlob(
      new Blob(['\ufeff' + lines.join('\r\n') + '\r\n'], { type: 'text/vcard;charset=utf-8' }),
      safeFileName(profile.name) + '.vcf'
    );
  });

  // HTML 내보내기는 CSS/JS 외부 파일 연결을 그대로 유지합니다.
  byId('export-html').addEventListener('click', () => {
    const copy = document.documentElement.cloneNode(true);
    copy.querySelector('#profile-data').textContent = JSON.stringify(profile)
      .replace(/</g, '\\u003c')
      .replace(/>/g, '\\u003e')
      .replace(/&/g, '\\u0026');

    const copyImage = copy.querySelector('#avatar-image');
    copyImage.removeAttribute('src');
    copyImage.setAttribute('hidden', '');
    copy.querySelector('#editor-dialog').removeAttribute('open');
    copy.querySelector('#announce').textContent = '';

    // JS 실행 중 생성한 UI는 저장본에서 제외하고 다시 로드할 때 JS가 생성합니다.
    copy.querySelector('#business-card-interaction-styles')?.remove();
    copy.querySelector('#copy-toast')?.remove();

    const fileContent = '<!DOCTYPE html>\n' + copy.outerHTML;
    saveBlob(
      new Blob([fileContent], { type: 'text/html;charset=utf-8' }),
      safeFileName(profile.name) + '_웹명함.html'
    );
    byId('announce').textContent = 'HTML을 저장했습니다. 같은 폴더에 style.css와 script.js가 있어야 작동합니다.';
  });

  installInteractionStyles();
  renderProfile();
})();