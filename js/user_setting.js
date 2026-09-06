const cookieMaxAge = 60 * 60 * 24 * 365;
const form = document.getElementById('profile-form');
const nameInput = document.getElementById('name');
const genderInput = document.getElementById('gender');
const formError = document.getElementById('form-error');

const getCookie = (key) => document.cookie
	.split('; ')
	.find((item) => item.startsWith(`${key}=`))
	?.slice(key.length + 1);

const setCookie = (key, value) => {
	document.cookie = `${key}=${encodeURIComponent(value)}; max-age=${cookieMaxAge}; path=/; SameSite=Lax`;
};

if (nameInput) nameInput.value = decodeURIComponent(getCookie('callRoomName') || '');
if (genderInput) genderInput.value = decodeURIComponent(getCookie('callRoomGender') || '');

form?.addEventListener('submit', (event) => {
	event.preventDefault();
	const name = nameInput?.value.trim() || '';
	const gender = genderInput?.value || '';

	if (!name || !gender) {
		if (formError) formError.textContent = '名前と性別の両方を入力・選択してください。';
		if (!name) nameInput?.focus();
		else genderInput?.focus();
		return;
	}

	setCookie('callRoomName', name);
	setCookie('callRoomGender', gender);
	window.location.href = '../index.html';
});
