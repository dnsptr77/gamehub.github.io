const games = [
  {
    name: "Snake Game",
    type: "arcade",
    play: "snake"
  },
  {
    name: "Flappy Bird Lite",
    type: "casual",
    play: "flappy"
  }
];

const gameList = document.getElementById("gameList");
const search = document.getElementById("search");

function render(list){
  gameList.innerHTML = "";
  list.forEach(g=>{
    gameList.innerHTML += `
      <div class="card" onclick="openGame('${g.play}')">
        <h3>${g.name}</h3>
        <p>Genre: ${g.type}</p>
      </div>
    `;
  });
}

function filterGame(type){
  if(type === "all") return render(games);
  render(games.filter(g=>g.type === type));
}

search.addEventListener("input", e=>{
  let val = e.target.value.toLowerCase();
  render(games.filter(g=>g.name.toLowerCase().includes(val)));
});

function openGame(name){
  if(name === "snake") window.location.href = "snake.html";
  if(name === "flappy") window.location.href = "flappy.html";
}

render(games);
