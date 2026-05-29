function getTeam() { return localStorage.getItem('selected_team') || 'men'; }

function updateToggleUI(isWomen) {
  var menBtns = document.querySelectorAll('.toggle-men');
  var womenBtns = document.querySelectorAll('.toggle-women');

  menBtns.forEach(function(btn) {
    var size = isWomen ? btn.dataset.sizeInactive : btn.dataset.sizeActive;
    if (isWomen) {
      btn.style.cssText = 'font-size:' + size + ';color:#94a3b8;text-shadow:none';
    } else {
      btn.style.cssText = 'font-size:' + size + ';color:#3b82f6;text-shadow:0 0 14px rgba(59,130,246,0.8)';
    }
  });

  womenBtns.forEach(function(btn) {
    var size = isWomen ? btn.dataset.sizeActive : btn.dataset.sizeInactive;
    if (isWomen) {
      btn.style.cssText = 'font-size:' + size + ';color:#ec4899;text-shadow:0 0 14px rgba(236,72,153,0.8)';
    } else {
      btn.style.cssText = 'font-size:' + size + ';color:#94a3b8;text-shadow:none';
    }
  });
}

function switchTeam(isWomen) {
  updateToggleUI(isWomen);
  localStorage.setItem('selected_team', isWomen ? 'women' : 'men');
  setTimeout(function() { location.reload(); }, 350);
}

(function() {
  updateToggleUI(getTeam() === 'women');
})();
