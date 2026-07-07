const sidebar = document.getElementById('sidebar');
const STORAGE_KEY = 'sidebar_open';

function setSidebar(isOpen) {
  sidebar.classList.toggle('collapsed', !isOpen);
  localStorage.setItem(STORAGE_KEY, isOpen ? '1' : '0');
  // 지도가 있으면 사이드바 너비 변경 후 invalidateSize
  if (window._leafletMap) {
    setTimeout(() => window._leafletMap.invalidateSize(), 220);
  }
}

// 초기 상태 복원 (기본값: 열림)
const savedState = localStorage.getItem(STORAGE_KEY);
setSidebar(savedState !== '0');

document.querySelectorAll('#hamburger-btn, #hamburger-btn-top').forEach(btn => {
  btn.addEventListener('click', () => {
    setSidebar(sidebar.classList.contains('collapsed'));
  });
});
