const nazevInput = document.getElementById("nazev-vydaje");
const castkaInput = document.getElementById("castka");
const kategorieSelect = document.getElementById("kategorie");
const pridatBtn = document.getElementById("pridat-btn");
const celkemText = document.getElementById("celkem");
const vydajeList = document.getElementById("seznam-vydaju");

let vydaje = [];

function vykresliVydaje () {
vydajeList.innerHTML = "";

vydaje.forEach(function (vydaj, index) {
    vydajeList.innerHTML += "<p>" + vydaj.nazev +
     " | " + vydaj.kategorie + 
     " | " + vydaj.castka + 
     " Kč<button class='smazat-btn' data-index='" + index + "'>Smazat</button></p>";
});
document.querySelectorAll(".smazat-btn").forEach(function (smazatBtn) {
    smazatBtn.addEventListener("click", function () {
        let index = Number(smazatBtn.getAttribute("data-index"));
        vydaje.splice(index, 1);
        vykresliVydaje();
        spocitejCelkem();
    });
});
}

function spocitejCelkem () {

let celkem = 0;
vydaje.forEach(function (vydaj) {
    celkem += vydaj.castka;
});
celkemText.textContent = celkem + " Kč";
}

function vycistiVydaje () {
    nazevInput.value = "";
    castkaInput.value = "";
    kategorieSelect.value = "benzin";
}


pridatBtn.addEventListener("click", function () {
let nazev = nazevInput.value;
let castka = 
Number(castkaInput.value);
let kategorie = kategorieSelect.value;

if (nazev.trim() === "") {
    alert("Název výdaje je povinny");
    return;
}
if (castka <= 0) {
    alert("Částka je povinna");
    return;
}

let vydaj = { 
    nazev: nazev,
    castka: castka,
    kategorie: kategorie
};
vydaje.push(vydaj);
vykresliVydaje();
spocitejCelkem();
vycistiVydaje();

});