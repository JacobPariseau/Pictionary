const joinForm = $('#join-form');
const joinInput = $('#join-input');

function joinGame(e) {
  $('#join-input').val();

  window.location.href = "/" + $('#join-input').val();
  return false;
}
