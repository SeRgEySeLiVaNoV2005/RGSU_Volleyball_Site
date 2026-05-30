// Shared API helpers for all pages — Supabase-backed endpoints

function getTeam() {
  return localStorage.getItem('selected_team') || 'men';
}

function getToken() {
  return localStorage.getItem('auth_token') || '';
}

// Base fetch wrapper with team parameter and optional auth
function apiGet(path) {
  var url = path + (path.indexOf('?') === -1 ? '?' : '&') + 'team=' + getTeam();
  var headers = {};
  var token = getToken();
  if (token) headers['Authorization'] = 'Bearer ' + token;
  return fetch(url, { headers: headers }).then(function(r) {
    if (!r.ok) return r.json().then(function(e) { throw new Error(e.error || 'API error'); });
    return r.json();
  });
}

function apiPost(path, body) {
  var url = path + (path.indexOf('?') === -1 ? '?' : '&') + 'team=' + getTeam();
  var headers = { 'Content-Type': 'application/json' };
  var token = getToken();
  if (token) headers['Authorization'] = 'Bearer ' + token;
  return fetch(url, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(body)
  }).then(function(r) {
    if (!r.ok) return r.json().then(function(e) { throw new Error(e.error || 'API error'); });
    return r.json();
  });
}

function apiPut(path, body) {
  var url = path + (path.indexOf('?') === -1 ? '?' : '&') + 'team=' + getTeam();
  var headers = { 'Content-Type': 'application/json' };
  var token = getToken();
  if (token) headers['Authorization'] = 'Bearer ' + token;
  return fetch(url, {
    method: 'PUT',
    headers: headers,
    body: JSON.stringify(body)
  }).then(function(r) {
    if (!r.ok) return r.json().then(function(e) { throw new Error(e.error || 'API error'); });
    return r.json();
  });
}

function apiDelete(path) {
  var url = path + (path.indexOf('?') === -1 ? '?' : '&') + 'team=' + getTeam();
  var headers = {};
  var token = getToken();
  if (token) headers['Authorization'] = 'Bearer ' + token;
  return fetch(url, {
    method: 'DELETE',
    headers: headers
  }).then(function(r) {
    if (!r.ok) return r.json().then(function(e) { throw new Error(e.error || 'API error'); });
    return r.json();
  });
}

// ===== PUBLIC DATA LOADERS =====

// Load homepage + settings for public pages
function loadHomepage(callback) {
  apiGet('/api/homepage')
    .then(function(hp) { callback(null, hp); })
    .catch(function(e) { callback(e); });
}

function loadSettings(callback) {
  apiGet('/api/settings')
    .then(function(s) { callback(null, s); })
    .catch(function(e) { callback(e); });
}

// Load players list
function loadPlayers(callback) {
  apiGet('/api/players')
    .then(function(players) { callback(null, players); })
    .catch(function(e) { callback(e); });
}

// Load posts (published only by default)
function loadPosts(callback, includeUnpublished) {
  var headers = {};
  if (includeUnpublished) headers['X-Admin'] = 'true';
  var url = '/api/posts?team=' + getTeam();
  var token = getToken();
  if (token) headers['Authorization'] = 'Bearer ' + token;
  return fetch(url, { headers: headers })
    .then(function(r) { return r.json(); })
    .then(function(posts) { callback(null, posts); })
    .catch(function(e) { callback(e); });
}

// Load tournaments
function loadTournaments(callback) {
  apiGet('/api/tournaments')
    .then(function(t) { callback(null, t); })
    .catch(function(e) { callback(e); });
}

// Like / Unlike
function toggleLike(postId, action, callback) {
  apiPost('/api/likes', { postId: postId, action: action })
    .then(function(r) { callback(null, r); })
    .catch(function(e) { callback(e); });
}

// Add comment
function addComment(postId, text, yandexUser, callback) {
  apiPost('/api/comments', {
    post_id: postId,
    text: text,
    yandexUser: yandexUser
  })
    .then(function(r) { callback(null, r); })
    .catch(function(e) { callback(e); });
}

// ===== ADMIN CRUD HELPERS =====

function createPlayer(data, callback) {
  apiPost('/api/players', data)
    .then(function(r) { callback(null, r); })
    .catch(function(e) { callback(e); });
}

function updatePlayer(id, data, callback) {
  apiPut('/api/players/' + id, data)
    .then(function(r) { callback(null, r); })
    .catch(function(e) { callback(e); });
}

function deletePlayer(id, callback) {
  apiDelete('/api/players/' + id)
    .then(function(r) { callback(null, r); })
    .catch(function(e) { callback(e); });
}

function createPost(data, callback) {
  apiPost('/api/posts', data)
    .then(function(r) { callback(null, r); })
    .catch(function(e) { callback(e); });
}

function updatePost(id, data, callback) {
  apiPut('/api/posts/' + id, data)
    .then(function(r) { callback(null, r); })
    .catch(function(e) { callback(e); });
}

function deletePost(id, callback) {
  apiDelete('/api/posts/' + id)
    .then(function(r) { callback(null, r); })
    .catch(function(e) { callback(e); });
}

function createTournament(data, callback) {
  apiPost('/api/tournaments', data)
    .then(function(r) { callback(null, r); })
    .catch(function(e) { callback(e); });
}

function updateTournament(id, data, callback) {
  apiPut('/api/tournaments/' + id, data)
    .then(function(r) { callback(null, r); })
    .catch(function(e) { callback(e); });
}

function deleteTournament(id, callback) {
  apiDelete('/api/tournaments/' + id)
    .then(function(r) { callback(null, r); })
    .catch(function(e) { callback(e); });
}

function saveHomepage(data, callback) {
  apiPut('/api/homepage', data)
    .then(function(r) { callback(null, r); })
    .catch(function(e) { callback(e); });
}

function saveSettings(data, callback) {
  apiPut('/api/settings', data)
    .then(function(r) { callback(null, r); })
    .catch(function(e) { callback(e); });
}
