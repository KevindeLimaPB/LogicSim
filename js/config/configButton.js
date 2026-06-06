document.addEventListener("DOMContentLoaded", function () {
    function setupExplorarButton(buttonId, infoId) {
        const button = document.getElementById(buttonId);
        const info = document.getElementById(infoId);

        if (!button || !info) return;

        const containerBg = info.closest(".conteudo-bg");
        if (!containerBg) return;

        button.addEventListener("click", function () {
            // Fechar outros painéis antes de abrir este
            document.querySelectorAll('.conteudo-bg').forEach((el) => {
                if (el !== containerBg) el.style.display = 'none';
            });

            containerBg.style.display = "block";
            info.scrollIntoView({ behavior: "smooth" });
        });
    }

    setupExplorarButton("btn-explorar-and", "infor-and");
    setupExplorarButton("btn-explorar-or", "infor-or");
    setupExplorarButton("btn-explorar-not", "infor-not");
    setupExplorarButton("btn-explorar-nand", "infor-nand");
    setupExplorarButton("btn-explorar-nor", "infor-nor");
    setupExplorarButton("btn-explorar-xor","infor-xor");
    setupExplorarButton("btn-explorar-xnor","infor-xnor");
    setupExplorarButton("btn-explorar-tabela","infor-tabela");
    setupExplorarButton("btn-explorar-comu","infor-comu");
});