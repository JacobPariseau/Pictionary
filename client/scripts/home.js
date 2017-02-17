$(document).ready(function() {
  const joinForm = $('#join-form');
  const joinInput = $('#join-input');

  const playOnline = $('#play-online');
  const createInput = $('#create-input');

  const modal = $('#modal');
  const modalOk = $('#modal-ok');
  const modalHeader = $('#modal-header');
  const modalText = $('#modal-text');

  joinForm.submit(function (e) {
    e.preventDefault();
    window.location.href = "/" + joinInput.val();
    return false;
  });
  playOnline.click(function () {
    modal.removeClass('hide');
    modalHeader.text("PLAY ONLINE");
    modalText.text("What would you like to call your room?");
    modalOk.text('START DRAWING');
  });

  modalOk.click(function () {
    modal.addClass('hide');
    window.location.href = "/" + createInput.val();
  });
});
