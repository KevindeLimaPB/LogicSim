 //NÃO APAGA - CODIGO QUE DESABILITA O BOTAO DIREITO, F12 e CTRL + U
 
 document.addEventListener('contextmenu', event => event.preventDefault());


  document.addEventListener('keydown', function(event) {
    if (event.ctrlKey && (event.key === 'u' || event.key === 'U')) {
      event.preventDefault(); 
    }
    if (event.ctrlKey && event.shiftKey && (event.key === 'i' || event.key === 'I')) {
      event.preventDefault(); 
    }
    if (event.key === 'F12') {
      event.preventDefault();
    }
  });