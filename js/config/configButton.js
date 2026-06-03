//pagina saiba mais - exemplos 

const exemplos = document.querySelectorAll(".exemplo-lista button");

function ativarExemplo(event){
    const exemplo = event.currentTarget;
    const controls = exemplo.getAttribute('aria-controls');
    const resposta = document.getElementById(controls);

    
    resposta.classList.toggle('ativa');
    const ativa = resposta.classList.contains('ativa');
    exemplo.setAttribute('aria-expanded', ativa);
   
}

function eventosExemplos(exemplo) {
    exemplo.addEventListener('click', ativarExemplo);
}

exemplos.forEach(eventosExemplos)
console.log(exemplos);