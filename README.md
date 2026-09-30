# Il Gioco del Palio

**Il Gioco del Palio** è un gioco gestionale ambientato nel mondo del Palio di Siena.

Il giocatore entra in una partita e assume un ruolo all'interno di una Contrada. Durante la partita deve gestire le risorse della propria Contrada e, attraverso una chat basata sull'intelligenza artificiale, instaurare rapporti con i fantini disponibili.

L'obiettivo del progetto è realizzare una simulazione gestionale nella quale le decisioni prese dal giocatore influenzano i rapporti, le risorse e le possibilità della propria Contrada durante il percorso verso il Palio.

---

## Funzionalità

### Autenticazione

Il progetto utilizza Supabase Auth per la gestione degli account.

È possibile:

* creare un nuovo account;
* accedere con nome utente e password;
* effettuare il logout;
* mantenere la sessione dell'utente;
* associare nome, cognome e nome utente al profilo.

Gli utenti non utilizzano direttamente un indirizzo email: il nome utente viene trasformato internamente in un indirizzo del dominio `@giocodelpalio.it`.

Esempio:

```text
andrea
```

viene utilizzato internamente come:

```text
andrea@giocodelpalio.it
```

---

## Gestione delle partite

Dopo l'accesso, l'utente può visualizzare le partite alle quali è associato.

È possibile:

* creare una nuova partita;
* scegliere il nome della partita;
* impostare l'anno iniziale;
* inserire una descrizione;
* utilizzare un codice amministratore per creare la partita;
* diventare automaticamente Sindaco della partita;
* generare un codice di invito;
* entrare in una partita tramite codice;
* visualizzare le partite associate al proprio account;
* uscire dall'account.

Ogni partita possiede un codice nel formato:

```text
PALIO-XXXXXX
```

che può essere utilizzato dagli altri giocatori per entrare nella partita.

---

## Ruoli dei giocatori

Ogni partita può contenere più giocatori.

Il creatore della partita assume il ruolo di:

```text
Sindaco
```

Il Sindaco può assegnare agli altri giocatori:

* **Capitano**
* **Mangino**

e può associare ciascun giocatore a una Contrada.

Un giocatore che è entrato nella partita ma non ha ancora ricevuto un'assegnazione rimane nello stato:

```text
In attesa
```

---

## Gestione delle Contrade

Il sistema utilizza le Contrade presenti nel database e permette al Sindaco di associare una Contrada a ciascun giocatore.

Per ogni giocatore assegnato vengono visualizzati:

* ruolo;
* Contrada;
* saldo dei crediti.

Il Sindaco può inoltre assegnare crediti alla Contrada del giocatore.

I movimenti vengono registrati nella tabella dedicata ai movimenti dei crediti, permettendo di calcolare il saldo complessivo della Contrada.

---

## Dashboard della partita

Ogni partita dispone di una propria area gestionale.

La pagina principale della partita mostra informazioni relative a:

* partita corrente;
* anno;
* codice di invito;
* ruolo del giocatore;
* Contrada assegnata;
* crediti disponibili;
* giocatori presenti nella partita.

Il Sindaco dispone inoltre degli strumenti per:

* visualizzare i giocatori;
* assegnare ruolo e Contrada;
* assegnare crediti;
* eliminare definitivamente la partita.

L'eliminazione della partita richiede una conferma esplicita e non può essere annullata dall'interfaccia.

---

## Fantini

La sezione **Fantini** permette ai giocatori che hanno ricevuto una Contrada di visualizzare i fantini disponibili.

Per ogni fantino vengono mostrati:

* nome;
* soprannome, quando presente.
* livello del rapporto con la contrada.

Selezionando un fantino viene aperta una conversazione dedicata.

La relazione tra Contrada e fantino viene gestita tramite un livello numerico da `0` a `100`.

Il livello della relazione influenza il comportamento del fantino durante la conversazione.

### Livelli di relazione

Il sistema utilizza quattro fasce:

| Livello | Comportamento            |
| ------: | ------------------------ |
|    0–19 | Diffidente e formale     |
|   20–49 | Cauto ma disponibile     |
|   50–79 | Cordiale e collaborativo |
|  80–100 | Estremamente leale       |

La relazione viene quindi utilizzata come parte del contesto inviato al modello di intelligenza artificiale.

---

## Chat con i fantini

La conversazione con i fantini è gestita attraverso il componente:

```text
components/FantinoChat.tsx
```

La chat:

* carica la cronologia della conversazione;
* permette di inviare messaggi;
* mostra i messaggi dell'utente e del fantino;
* mantiene la conversazione associata alla partita;
* mantiene la conversazione associata alla Contrada;
* mantiene la conversazione associata al fantino;
* mostra un indicatore mentre il fantino sta elaborando la risposta;
* gestisce gli errori di comunicazione;
* limita la quantità di messaggi inviabili in una determinata finestra temporale.

La cronologia viene caricata dal database e ordinata cronologicamente.

---

## Intelligenza artificiale

Le risposte dei fantini vengono generate tramite un'API esterna raggiunta dal backend dell'applicazione.

Il modello principale configurato nel progetto è:

```text
google/gemma-4-26b-a4b-it
```

È inoltre possibile configurare un modello di riserva tramite una variabile d'ambiente.

Il sistema costruisce dinamicamente il prompt del fantino utilizzando informazioni presenti nel database, tra cui:

* nome;
* soprannome;
* personalità;
* livello del rapporto con la Contrada.

Il modello riceve anche la cronologia recente della conversazione.

Il comportamento del fantino viene quindi adattato al livello di rapporto con la Contrada.

---

## Limite dei messaggi

L'API della chat applica un limite di:

```text
20 messaggi ogni 10 minuti
```

per utente.

Il limite viene verificato lato server prima di inviare la richiesta al modello.

Se il limite viene superato, l'API restituisce:

```text
HTTP 429
```

e informa l'utente che è necessario attendere prima di inviare altri messaggi.

---

## Gestione degli errori dell'IA

La comunicazione con il servizio di intelligenza artificiale utilizza un sistema di retry.

Per ogni modello configurato vengono effettuati fino a tre tentativi.

In caso di errore temporaneo vengono effettuati nuovi tentativi con un'attesa progressiva.

Il sistema gestisce inoltre:

* errori HTTP;
* rate limit;
* mancata connessione;
* modello non disponibile;
* risposta non valida.

Quando il servizio non riesce a rispondere, l'utente riceve un messaggio di errore senza che vengano esposti dettagli tecnici del backend.

---

## API

Il progetto contiene attualmente due API principali.

### `/api/partite`

Gestisce le operazioni relative alle partite.

Le operazioni supportate includono:

```text
crea
unisciti
membri
assegna
elimina
crediti
```

#### Creazione partita

Permette di creare una partita dopo aver verificato il codice amministratore.

#### Entrata in una partita

Permette a un utente di unirsi a una partita tramite il relativo codice.

#### Gestione membri

Permette al Sindaco di recuperare i membri della partita.

#### Assegnazione

Permette al Sindaco di assegnare:

* ruolo;
* Contrada.

#### Crediti

Permette al Sindaco di aggiungere crediti alla Contrada di un giocatore.

#### Eliminazione

Permette al Sindaco di eliminare una partita.

---

### `/api/chat`

Gestisce la comunicazione tra giocatore e fantino.

L'API:

1. verifica i parametri ricevuti;
2. verifica il token dell'utente;
3. verifica la partecipazione alla partita;
4. verifica che l'utente abbia una Contrada;
5. controlla il limite dei messaggi;
6. recupera il fantino;
7. recupera il livello della relazione;
8. recupera la cronologia della conversazione;
9. costruisce il contesto del fantino;
10. interroga il modello IA;
11. salva nel database il messaggio dell'utente;
12. salva la risposta del fantino;
13. restituisce la risposta al client.

---

## Struttura del progetto

La struttura principale dell'applicazione è:

```text
gestione-palio/
│
├── app/
│   ├── api/
│   │   ├── chat/
│   │   │   └── route.ts
│   │   └── partite/
│   │       └── route.ts
│   │
│   ├── accedi/
│   │   └── page.tsx
│   │
│   ├── partita/
│   │   └── [id]/
│   │       ├── layout.tsx
│   │       ├── page.tsx
│   │       └── fantini/
│   │           └── page.tsx
│   │
│   ├── partite/
│   │   └── page.tsx
│   │
│   ├── favicon.ico
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
│
├── components/
│   └── FantinoChat.tsx
│
├── lib/
│   └── supabase.ts
│
├── package.json
└── README.md
```

> La pagina dei fantini deve essere collocata in `app/partita/[id]/fantini/page.tsx` affinché Next.js riconosca correttamente la relativa route.

---

## Navigazione

La navigazione principale della partita è gestita da:

```text
app/partita/[id]/layout.tsx
```

La sidebar contiene attualmente le seguenti sezioni:

| Sezione               | Stato       |
| --------------------- | ----------- |
| Dashboard Contrada    | Disponibile |
| Centro trattative     | In arrivo   |
| Cavalli               | In arrivo   |
| Fantini               | Disponibile |
| Museo della Contrada  | In arrivo   |
| Archivio e Albo d'Oro | In arrivo   |

Le sezioni non ancora implementate vengono visualizzate come elementi disabilitati e non sono collegamenti navigabili.

---

## Tecnologie

Il progetto è sviluppato utilizzando:

### Frontend

* Next.js `16.3.6`
* React `19.2.8`
* TypeScript `5`
* CSS

### Backend

* Next.js Route Handlers
* Supabase

### Database e autenticazione

* Supabase
* Supabase Auth

### Intelligenza artificiale

* AI Gateway
* Google Gemma

---

## Dipendenze principali

Le principali dipendenze del progetto sono:

```json
{
  "@supabase/supabase-js": "^2.117.2",
  "next": "16.3.6",
  "react": "19.2.8",
  "react-dom": "19.2.8"
}
```

Per lo sviluppo vengono utilizzati inoltre:

```text
TypeScript
ESLint
eslint-config-next
Tailwind CSS
@types/node
@types/react
@types/react-dom
```

---

## Requisiti

Per eseguire il progetto localmente sono necessari:

* Node.js;
* npm;
* un progetto Supabase;
* le relative chiavi Supabase;
* una chiave per l'AI Gateway;
* il codice amministratore utilizzato per la creazione delle partite.

---

## Configurazione delle variabili d'ambiente

Creare un file:

```text
.env.local
```

nella root del progetto.

Le variabili utilizzate dal progetto includono:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

ADMIN_CODE=

AI_GATEWAY_API_KEY=
MODELLO_RISERVA=
```

Le variabili con `NEXT_PUBLIC_` vengono utilizzate dal client.

Le variabili contenenti chiavi riservate, in particolare:

```text
SUPABASE_SERVICE_ROLE_KEY
AI_GATEWAY_API_KEY
ADMIN_CODE
```

devono rimanere esclusivamente lato server e non devono essere inserite direttamente nel codice client.

---

## Installazione

Clonare il repository:

```bash
git clone https://github.com/andrea7668/Gestione-Palio.git
```

Entrare nella directory:

```bash
cd Gestione-Palio
```

Installare le dipendenze:

```bash
npm install
```

Configurare le variabili d'ambiente nel file:

```text
.env.local
```

---

## Avvio in sviluppo

Per avviare il server di sviluppo:

```bash
npm run dev
```

L'applicazione sarà disponibile normalmente all'indirizzo:

```text
http://localhost:3000
```

---

## Build di produzione

Per verificare la build:

```bash
npm run build
```

Per avviare la versione di produzione:

```bash
npm run start
```

---

## Controllo del codice

Il progetto utilizza ESLint.

Il controllo può essere eseguito con:

```bash
npm run lint
```

---

## Flusso di gioco attuale

Il flusso principale dell'applicazione è:

```text
Home
 │
 ├── Nuova partita
 │       │
 │       └── Registrazione / accesso
 │
 └── Entra
         │
         └── Accesso
                 │
                 ▼
             Le tue partite
                 │
        ┌────────┴────────┐
        │                 │
   Crea partita       Carica partita
        │                 │
        └────────┬────────┘
                 ▼
             Partita
                 │
        ┌────────┴──────────────┐
        │                       │
   Gestione giocatori       Fantini
        │                       │
   Ruoli/Contrade          Selezione fantino
        │                       │
     Crediti               Chat IA
                                │
                                ▼
                       Relazione con il fantino
```

---

## Stato del progetto

Il progetto dispone attualmente di una base funzionante per:

* autenticazione;
* creazione delle partite;
* ingresso tramite codice;
* gestione dei membri;
* assegnazione dei ruoli;
* assegnazione delle Contrade;
* gestione dei crediti;
* dashboard della partita;
* elenco dei fantini;
* sistema di relazione Contrada-fantino;
* chat con i fantini tramite IA;
* salvataggio della cronologia delle conversazioni.

La struttura della sidebar prevede inoltre ulteriori sezioni progettate per l'espansione del gioco:

* Centro trattative;
* Cavalli;
* Museo della Contrada;
* Archivio e Albo d'Oro.

Queste sezioni sono attualmente indicate nell'interfaccia come funzionalità in arrivo e non costituiscono ancora route attive.

---

## Obiettivo del progetto

Il progetto è pensato come una simulazione gestionale del mondo del Palio di Siena, nella quale la gestione della Contrada non si limita a una semplice interfaccia amministrativa.

Il sistema è progettato per evolvere verso un'esperienza nella quale:

* le risorse economiche devono essere gestite;
* i rapporti con i fantini possono cambiare;
* le decisioni del giocatore influenzano le possibilità della Contrada;
* le rivalità e i rapporti tra Contrade possono diventare elementi strategici;
* la gestione dei cavalli e delle trattative può essere integrata nel corso della partita;
* la storia della Contrada può essere registrata nel corso delle diverse annate.

L'architettura attuale fornisce la base per l'integrazione progressiva di questi sistemi mantenendo separate autenticazione, gestione delle partite, logica server e interfaccia di gioco.
