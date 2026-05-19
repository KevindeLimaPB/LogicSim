// Lampada

const lampada = document.querySelector('.lampada');
const imagem = document.getElementById('imagem');
const main = document.getElementById('porta-bg') || document.getElementById('simulador-bg');
const lista = document.getElementById('porta-logicas-listas');

// Alterna a imagem e o estado visual da lâmpada.
function trocaImage(){
    if (!imagem) {
        return;
    }

    const body = document.querySelector('body').classList.toggle("luz");
    
    if(imagem.src.includes("desligada.svg")){
        imagem.src = "./img/lampadas/ligada.svg";
        if (main) {
            main.classList.add("ativo");
        }
        if (lista) {
            lista.classList.add("hover");
        }
    }else {
        imagem.src = "./img/lampadas/desligada.svg";
        if (main) {
            main.classList.remove("ativo");
        }
        if (lista) {
            lista.classList.remove("hover");
        }
    }

}

if (lampada) {
    lampada.addEventListener('click', trocaImage);
}
