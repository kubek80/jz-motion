# LLM Lab: video script

The voice-over for the example **LLM Lab: choosing AI models on our own terms** (`src/examples/llm-lab.json`). Each line is one beat's speaker notes, so the Timing window shows the same text as a teleprompter. About 1,180 words, roughly 7 minutes at a calm pace: the original 5-minute script plus three added scenes (*Where they work: RAG*, *RAG in 3D* and *Why these models*).

Screenshots of LLM Lab are in `public/examples/llm-lab/` (dark theme, 1440×900, example data). To retake them, run LLM Lab (`npm run dev` in the llm-lab repository) and capture these addresses:

| Screen | Address |
|---|---|
| Recommendations | `localhost:5173/#/` |
| Classification ranking | `localhost:5173/#/ranking/classification` (and scrolled to the table, hovering ModernBERT) |
| Intent detection only | `localhost:5173/#/ranking/classification?set=cls-support-intents` |
| Embedding tie | `localhost:5173/#/ranking/embedding` |
| Test sets, training sets | `localhost:5173/#/datasets?kind=test`, `localhost:5173/#/datasets?kind=training` |

## Script

### 1. Opening

- **Every week, a new #1.** Every week a new AI model claims to be the best.
- **Best on what?.** But best on whose data? Best for which job? And best at what price?
- **LLM Lab.** We built LLM Lab so we can answer those questions ourselves, with our own data and by our own rules.

### 2. How models get chosen

- **Leaderboard.** Most companies choose models in one of three ways: a public leaderboard,
- **Sales deck, first team.** a vendor's sales deck, or whatever the first team happened to use.
- **Into production.** Whichever way, a model ends up in production.
- **One weakness.** All three share one weakness: the test wasn't ours.

### 3. Someone else's test

- **Someone else's test.** A public benchmark measures someone else's documents, someone else's languages and someone else's idea of good.
- **Our language.** A model that tops the charts in English may struggle with Polish support tickets.
- **Two points, thirty times.** A model that's two points better might cost thirty times more.
- **Nobody checks.** And once a model is in production, nobody checks whether it's still the right choice.

### 4. Our data. Our criteria. Our decision.

- **Our data.** Our data.
- **Our criteria.** Our criteria.
- **Our decision.** Our decision.
- **What sovereignty means.** That's what sovereignty means here. We're not building our own models. We're owning the decision.

### 5. What each part means

- **Our data.** Our data. The test cases come from our own work: real support questions, real contracts, real tickets.
- **In our repository.** They live in our own repository and get reviewed like code.
- **Our criteria.** Our criteria. We decide what good enough means.
- **High bar for personal data.** For detecting personal data the bar is high, because a miss is a compliance incident. For product search it can be lower.
- **Our decision.** Our decision. A model we call through an API and a model we host ourselves face exactly the same tests.
- **Plan B.** If a provider raises prices or changes its terms, we already know our next-best option and what it costs.

### 6. Where they work: RAG

- **What RAG is.** Most of what we build answers from our own documents. It's called RAG: retrieval-augmented generation. The language model doesn't know our contracts; we find the right pages and hand them over.
- **Preparing documents.** First we prepare the documents: chunking cuts them into pieces that make sense on their own, and an embedding model turns every piece into numbers, so similar meanings end up close together.
- **A question comes in.** When a question comes in, we turn it into numbers the same way and look for the closest chunks.
- **Rerank, then answer.** Search is fast but rough, so a reranker reads the top fifty and puts the best ones first. Only the top five reach the language model that writes the answer.
- **Classification at the front door.** And before any of that, a classifier decides what the message is about, how urgent it is, and whether it contains personal data.
- **The quality is decided here.** If the chunks are bad or the search misses, the best language model in the world answers from the wrong page. These four small steps decide the quality, and they run on every document and every question.

### 7. RAG in 3D: what each model does

- **The same pipeline, in 3D.** Let's look at the same pipeline in 3D, and at what each of the three retrieval models actually does. It starts with a long document.
- **Chunking cuts it.** The chunking model decides where to cut. Too big and a chunk mixes topics; too small and it loses its meaning. That's why we test it on our own policies, manuals and transcripts.
- **Embedding turns chunks into vectors.** The embedding model turns every chunk into a vector, a long list of numbers, and stores it in the index.
- **Close in meaning, close in space.** Chunks that mean similar things end up close together, even when they use different words, or different languages.
- **The question takes the same path.** A question goes through the same embedding model, and the index returns the nearest vectors.
- **Fifty candidates, roughly sorted.** Vector search is fast but rough: it gives us the top fifty, and the best one is often not on top.
- **Reranking puts the best first.** The reranker reads the question together with each candidate and scores them properly. The one that really answers the question moves to the front.
- **Only the best reach the answer.** Only the top five go to the language model. Three small models decide what it gets to read, and that's why these are the ones we test.

### 8. Why these models

- **Why these four?.** Why these four? Because we only test models where our own data can change the answer: models that are worth fine-tuning.
- **Big models: prompt, don't tune.** A frontier language model is huge, general, and replaced every few months. We use it through prompts and RAG; fine-tuning it ourselves rarely pays off.
- **Building blocks: tune them.** The building blocks are different. They do one narrow job, millions of times. A small open model trained on a few thousand of our own examples can match a big one at a fraction of the cost.
- **The numbers.** On our support intents, a fine-tuned ModernBERT matches Claude Sonnet within the noise, at less than half a cent per thousand tickets instead of a dollar.
- **The rule.** So the rule is simple: if a model is worth fine-tuning, it's worth testing here, against the API models, on exactly the same cases.

### 9. What we test

- **The lab.** We're starting with four types of models, the building blocks behind search, assistants and automation.
- **Embedding.** Embedding models turn text into numbers, so we can find the documents that match a question.
- **Chunking.** Chunking splits long documents into pieces that make sense on their own.
- **Reranking.** Reranking takes the top search results and puts the best answer first.
- **Classification.** Classification sorts incoming items: what the customer wants, how urgent it is, whether the message contains personal data.
- **Built to grow.** More categories will follow. The lab is built to grow.

### 10. Three numbers, four answers

- **Recommendations.** This is the Recommendations page.
- **Three numbers.** Every model gets just three numbers: quality on our tests, cost per thousand tasks, and speed.
- **Only what we choose on.** We left out everything else, because those three are what we actually choose on.
- **Four answers.** From them, the lab gives four answers for every category: best quality, best value, cheapest and fastest.

### 11. Classification: quality vs cost

- **Classification.** Here's classification.
- **Up and to the left.** The chart shows quality against cost, and up and to the left is better.
- **The quality bar.** The dashed line is our quality bar. Anything below it isn't recommended, however cheap it is.

### 12. A fine-tuned model, honestly

- **A good example.** This fine-tuned model is a good example.
- **Looks great on average.** On average it looks great,
- **A tiny fraction of the cost.** and it costs a tiny fraction of the alternatives.
- **Below the minimum on personal data.** But on personal-data detection it falls below the minimum we set, so the lab won't recommend it as our one classifier for everything.

### 13. Use the model where it's strong

- **Intent detection alone.** Now look at intent detection alone.
- **Cheapest and fastest.** Here it becomes the cheapest and fastest choice.
- **Where it's strong.** It's the same data with a more precise question: use the model where it's strong.

### 14. Honest about uncertainty

- **Honest about uncertainty.** The lab is also honest about uncertainty.
- **Every score has a range.** Every score comes with a range.
- **A tie.** When two models are within that range of each other, the lab calls it a tie
- **Don't pay for noise.** and tells us to decide on cost or speed, instead of paying for a difference that isn't real.

### 15. Test sets and training sets

- **Test sets.** Finally, the data itself. Test sets are used only for scoring.
- **Training sets.** Training sets are used only for fine-tuning,
- **Checked for overlap.** and they're checked for overlap with the test sets, so no model scores higher just because it has already seen the answers.

### 16. Decisions we can explain

- **Why this model?.** This gives us decisions we can explain. When someone asks why this model,
- **Not a leaderboard.** the answer isn't: it was top of a leaderboard.
- **Evidence.** It's: it passed our tests, on our data, at this price, and here's the evidence.
- **A new model comes out.** And when a new model comes out, we add it, run it, and the lab shows us whether it's worth switching.

### 17. Close

- **A working prototype.** LLM Lab is a working prototype today, running on example data.
- **What's next.** Next we're connecting it to real evaluation runs and adding a way to compare two models case by case.
- **How you can help.** If your team has examples of real work, test cases are the most valuable thing you can contribute. Thank you.
## Recording notes

- The first beat of scenes 1, 4 and 16 and the last beat of scene 17 switch the video to the camera layout: on camera if you record yourself, the board otherwise.
- Running long? Shorten *Someone else's test* (scene 3) first, then *Where they work: RAG* (the 3D scene covers the same pipeline). Keep the walkthrough: the ModernBERT example is the clearest proof of the idea.
- Wording to keep accurate: “checked for overlap” describes what the screen shows; there are no real overlap checks behind it yet. “Connecting it to real evaluation runs” is the next step, not something already built.
- The numbers on the board (ModernBERT at $0.004 vs $1.05 per 1,000 items, 263× cheaper and 92× faster on support intents, the 85 and 72 minimum scores) come from LLM Lab's example data. Update them if the data changes.
