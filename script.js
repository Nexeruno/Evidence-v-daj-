//VÝDAJE
const nazevInput = document.getElementById("nazev-vydaje");
const castkaInput = document.getElementById("castka");
const kategorieSelect = document.getElementById("kategorie");
const pridatBtn = document.getElementById("pridat-btn");
const celkemText = document.getElementById("celkem");
const vydajeList = document.getElementById("seznam-vydaju");
const filtrKategorie = document.getElementById("filtr-kategorie");
const smazatVseBtn = document.getElementById("smazat-vse-btn");
const datumVydajeInput = document.getElementById("datum-vydaje");


let vydaje = [];

function vykresliVydaje () {
vydajeList.innerHTML = "";

let filtr = filtrKategorie.value;
let necoZobrazeno = false;

vydaje.forEach(function (vydaj, index) {
if(filtr !== "vse" && vydaj.kategorie !== filtr) 
    {
    return;
}

necoZobrazeno = true;

    vydajeList.innerHTML += "<div class='vydaj-polozka'>" 
    + "<span class='vydaj-nazev'>" 
    + vydaj.nazev + "</span>" 
    + "<span class='vydaj-kategorie'>" 
    + vydaj.kategorie + "</span>"
    + "<span class='vydaj-datum'>"
    + formatujDatum(vydaj.datum) + "</span>"
    + "<strong class='vydaj-castka'>"
    + vydaj.castka + " Kč</strong>" 
    + "<button class='smazat-btn' data-index='" 
    + index 
    + "'>Smazat</button>" 
    + "</div>";
    

    vydaj.nazev +
     " | " + vydaj.kategorie + 
     " | " + vydaj.castka + 
     " Kč<button class='smazat-btn' data-index='" + index + "'>Smazat</button></p>";
});

if (necoZobrazeno === false) {
vydajeList.innerHTML = "<p class='prazdny-stav'>Nebyly nalezeny záznamy</p>";
}

document.querySelectorAll(".smazat-btn").forEach(function (smazatBtn) {
    smazatBtn.addEventListener("click", function () {
        let index = Number(smazatBtn.getAttribute("data-index"));
        vydaje.splice(index, 1);
        ulozVydaje();
        vykresliVydaje();
        spocitejCelkem();
        spocitejSouhrn();
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
    datumVydajeInput.value = "";
}

function ulozVydaje () {
    localStorage.setItem("vydaje", JSON.stringify(vydaje));
}

function nactiVydaje () {
    let ulozeneVydaje = localStorage.getItem("vydaje");
    if (ulozeneVydaje) {
        vydaje = 
        JSON.parse(ulozeneVydaje);
        vykresliVydaje();
        spocitejCelkem();
    }
}

function formatujDatum (datum) {
if (datum === "") {
    return "";
}
let casti = datum.split("-");
return casti[2] + "." + casti[1] + "." + casti[0];
}




pridatBtn.addEventListener("click", function () {
let nazev = nazevInput.value;
let castka = 
Number(castkaInput.value);
let kategorie = kategorieSelect.value;
let datum = datumVydajeInput.value;

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
    kategorie: kategorie,
    datum: datum
};
vydaje.push(vydaj);
ulozVydaje();
vykresliVydaje();
spocitejCelkem();
spocitejSouhrn();
vycistiVydaje();
});


filtrKategorie.addEventListener("change", function() {
    vykresliVydaje();
});

smazatVseBtn.addEventListener("click", function() {
    vydaje = [];
    ulozVydaje();
    vykresliVydaje();
    spocitejCelkem();
    spocitejSouhrn();
});

nactiVydaje();

// PŘÍJMY

const nazevPrijmuInput = document.getElementById("nazev-prijmu");
const castkaPrijmuInput = document.getElementById("castka-prijmu");
const kategoriePrijmuSelect = document.getElementById("kategorie-prijmu");
const pridatPrijemBtn = document.getElementById("pridat-prijem-btn");
const celkemPrijmyText = document.getElementById("celkem-prijmy");
const prijmyList = document.getElementById("seznam-prijmu");
const filtrKategoriePrijmy = document.getElementById("filtr-kategorie-prijmy");
const smazatVsePrijmyBtn = document.getElementById("smazat-vse-prijmy-btn");
const datumPrijmuInput = document.getElementById("datum-prijmu");
let prijmy = [];

function vykresliPrijmy () {

let filtr = filtrKategoriePrijmy.value;
let necoZobrazeno = false;

prijmyList.innerHTML = "";

prijmy.forEach(function (prijem, index) {
if(filtr !== "vse-prijem" && prijem.kategorie !== filtr) 
    {
    return;
}
necoZobrazeno = true;

prijmyList.innerHTML += "<div class='prijem-polozka'>" 
    + "<span class='prijem-nazev'>" 
    + prijem.nazev + "</span>" 
    + "<span class='prijem-kategorie'>" 
    + prijem.kategorie + "</span>"
    + "<span class='prijem-datum'>" 
    + formatujDatum(prijem.datum) + "</span>"
    + "<strong class='prijem-castka'>"
    + prijem.castka + " Kč</strong>" 
    + "<button class='smazat-btn-prijem' data-index='" 
    + index 
    + "'>Smazat</button>" 
    + "</div>";
});

if (necoZobrazeno === false) {
    prijmyList.innerHTML = "<div class='prazdny-stav-prijem'>Nenalezeno</div>";
}

document.querySelectorAll(".smazat-btn-prijem").forEach(function (smazatBtn) {
    smazatBtn.addEventListener("click", function () {
        let index = Number(smazatBtn.getAttribute("data-index"));
        prijmy.splice(index, 1);
        ulozPrijmy();
        vykresliPrijmy();
        spocitejCelkemPrijmy();
        spocitejSouhrn();
    });
});
}
function spocitejCelkemPrijmy () {
    
let celkem = 0;
prijmy.forEach(function (prijem) {
    celkem += prijem.castka;
});
celkemPrijmyText.textContent = celkem + " Kč";
}

function vycistiPrijmy () {
    nazevInput.value = "";
    castkaInput.value = "";
    kategoriePrijmuSelect.value = "prace";
    datumPrijmuInput.value = "";
}

function ulozPrijmy () {
    localStorage.setItem("prijmy", JSON.stringify(prijmy));
}

function nactiPrijmy () {
    let ulozenePrijmy = localStorage.getItem("prijmy");
    if (ulozenePrijmy) {
        prijmy = 
        JSON.parse(ulozenePrijmy);
        vykresliPrijmy();
        spocitejCelkemPrijmy();
    }
}

function formatujDatumPrijmu (datum) {
if (datum === "") {
    return "";
}
let casti = datum.split("-");
return casti[2] + "." + casti[1] + "." + casti[0];
}



pridatPrijemBtn.addEventListener("click", function () {
let nazev = nazevPrijmuInput.value;
let castka = 
Number(castkaPrijmuInput.value);
let kategorie = kategoriePrijmuSelect.value;
let datum = datumPrijmuInput.value;

if (nazev.trim() === "") {
    alert("Název příjmů je povinny");
    return;
}
if (castka <= 0) {
    alert("Částka je povinna");
    return;
}

let prijem = {
    nazev: nazev,
    castka: castka,
    kategorie: kategorie,
    datum: datum
};

prijmy.push(prijem);
ulozPrijmy();
vykresliPrijmy();
spocitejCelkemPrijmy();
spocitejSouhrn();
vycistiPrijmy();
});


filtrKategoriePrijmy.addEventListener("change", function() {
    vykresliPrijmy();
});


smazatVsePrijmyBtn.addEventListener("click", function() {
    prijmy = [];
    ulozPrijmy();
    vykresliPrijmy();
    spocitejCelkemPrijmy();
    spocitejSouhrn();
    
});



//SOURHN

const prijmyCelkem = document.getElementById("prijmy-celkem");
const vydajeCelkem = document.getElementById("vydaje-celkem");
const zustatek = document.getElementById("zustatek");

function spocitejSouhrn () {

let soucetPrijmu = 0;
let soucetVydaju = 0;

prijmy.forEach(function (prijem) {
    soucetPrijmu += prijem.castka;
});

vydaje.forEach(function (vydaj) {
    soucetVydaju += vydaj.castka;
});

let vysledek = soucetPrijmu - soucetVydaju;

prijmyCelkem.textContent = " Příjmy celkem: " 
+ soucetPrijmu + " Kč";
vydajeCelkem.textContent = " Výdaje celkem: " 
+ soucetVydaju + " Kč";
zustatek.textContent = " Zůstatek: " 
+ vysledek + " Kč";

zustatek.classList.remove("zustatek-plus", "zustatek-minus", 
    "zustatek-nula");


if (vysledek > 0) {
    zustatek.classList.add("zustatek-plus");
} else if (vysledek < 0) {
    zustatek.classList.add("zustatek-minus");
} else {
    zustatek.classList.add("zustatek-nula");
}
}


nactiVydaje();
nactiPrijmy();
spocitejSouhrn();