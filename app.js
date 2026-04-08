(function () {
    'use strict';

    const STORAGE_KEY = 'recept.recipes.v1';

    // ----- Stav aplikace -----
    let recipes = loadRecipes();
    let editingId = null;

    // ----- DOM odkazy -----
    const views = {
        list: document.getElementById('view-list'),
        detail: document.getElementById('view-detail'),
        form: document.getElementById('view-form'),
    };
    const recipesEl = document.getElementById('recipes');
    const emptyStateEl = document.getElementById('empty-state');
    const searchEl = document.getElementById('search');
    const filterEl = document.getElementById('filter-category');
    const detailContentEl = document.getElementById('detail-content');
    const formEl = document.getElementById('recipe-form');
    const formTitleEl = document.getElementById('form-title');

    // ----- Inicializace -----
    document.getElementById('btn-new').addEventListener('click', openForm);
    document.getElementById('btn-back').addEventListener('click', showList);
    document.getElementById('btn-cancel').addEventListener('click', showList);
    searchEl.addEventListener('input', renderList);
    filterEl.addEventListener('change', renderList);
    formEl.addEventListener('submit', handleFormSubmit);

    showList();

    // ----- Práce s úložištěm -----
    function loadRecipes() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            console.error('Chyba při načítání receptů:', e);
            return [];
        }
    }

    function saveRecipes() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(recipes));
    }

    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    }

    // ----- Přepínání pohledů -----
    function showView(name) {
        Object.keys(views).forEach(function (key) {
            views[key].classList.toggle('hidden', key !== name);
        });
        window.scrollTo({ top: 0, behavior: 'instant' });
    }

    function showList() {
        editingId = null;
        renderList();
        showView('list');
    }

    // ----- Vykreslení seznamu -----
    function renderList() {
        const query = searchEl.value.trim().toLowerCase();
        const category = filterEl.value;

        const filtered = recipes
            .filter(function (r) {
                if (category && r.category !== category) return false;
                if (!query) return true;
                const haystack = [
                    r.title,
                    r.category,
                    r.ingredients,
                    r.instructions,
                    r.notes,
                ].join(' ').toLowerCase();
                return haystack.includes(query);
            })
            .sort(function (a, b) {
                return (b.updatedAt || 0) - (a.updatedAt || 0);
            });

        recipesEl.innerHTML = '';
        if (filtered.length === 0) {
            emptyStateEl.classList.remove('hidden');
            if (recipes.length > 0) {
                emptyStateEl.innerHTML = 'Žádný recept neodpovídá tvému hledání.';
            } else {
                emptyStateEl.innerHTML = 'Zatím tu nejsou žádné recepty. Klikni na <strong>+ Nový recept</strong> a přidej svůj první!';
            }
            return;
        }
        emptyStateEl.classList.add('hidden');

        filtered.forEach(function (recipe) {
            const card = document.createElement('div');
            card.className = 'recipe-card';
            card.addEventListener('click', function () { showDetail(recipe.id); });

            const title = document.createElement('h3');
            title.textContent = recipe.title;
            card.appendChild(title);

            const meta = document.createElement('div');
            meta.className = 'meta';

            if (recipe.category) {
                const badge = document.createElement('span');
                badge.className = 'badge';
                badge.textContent = recipe.category;
                meta.appendChild(badge);
            }
            if (recipe.time) {
                const time = document.createElement('span');
                time.textContent = '⏱ ' + recipe.time + ' min';
                meta.appendChild(time);
            }
            if (recipe.servings) {
                const serv = document.createElement('span');
                serv.textContent = '🍽 ' + recipe.servings + ' porcí';
                meta.appendChild(serv);
            }
            card.appendChild(meta);
            recipesEl.appendChild(card);
        });
    }

    // ----- Detail receptu -----
    function showDetail(id) {
        const recipe = recipes.find(function (r) { return r.id === id; });
        if (!recipe) {
            showList();
            return;
        }

        detailContentEl.innerHTML = '';

        const title = document.createElement('h2');
        title.textContent = recipe.title;
        detailContentEl.appendChild(title);

        const meta = document.createElement('div');
        meta.className = 'detail-meta';
        if (recipe.category) {
            const badge = document.createElement('span');
            badge.className = 'badge';
            badge.textContent = recipe.category;
            meta.appendChild(badge);
        }
        if (recipe.time) {
            const t = document.createElement('span');
            t.textContent = '⏱ ' + recipe.time + ' minut';
            meta.appendChild(t);
        }
        if (recipe.servings) {
            const s = document.createElement('span');
            s.textContent = '🍽 ' + recipe.servings + ' porcí';
            meta.appendChild(s);
        }
        detailContentEl.appendChild(meta);

        // Suroviny
        const ingredients = parseLines(recipe.ingredients);
        if (ingredients.length > 0) {
            const section = document.createElement('div');
            section.className = 'detail-section';
            const h3 = document.createElement('h3');
            h3.textContent = 'Suroviny';
            section.appendChild(h3);
            const ul = document.createElement('ul');
            ul.className = 'ingredients-list';
            ingredients.forEach(function (line) {
                const li = document.createElement('li');
                li.textContent = line;
                ul.appendChild(li);
            });
            section.appendChild(ul);
            detailContentEl.appendChild(section);
        }

        // Postup
        if (recipe.instructions && recipe.instructions.trim()) {
            const section = document.createElement('div');
            section.className = 'detail-section';
            const h3 = document.createElement('h3');
            h3.textContent = 'Postup';
            section.appendChild(h3);
            const p = document.createElement('p');
            p.className = 'instructions-text';
            p.textContent = recipe.instructions;
            section.appendChild(p);
            detailContentEl.appendChild(section);
        }

        // Poznámky
        if (recipe.notes && recipe.notes.trim()) {
            const section = document.createElement('div');
            section.className = 'detail-section';
            const h3 = document.createElement('h3');
            h3.textContent = 'Poznámky';
            section.appendChild(h3);
            const p = document.createElement('p');
            p.className = 'notes-text';
            p.textContent = recipe.notes;
            section.appendChild(p);
            detailContentEl.appendChild(section);
        }

        // Akce
        const actions = document.createElement('div');
        actions.className = 'detail-actions';

        const editBtn = document.createElement('button');
        editBtn.className = 'btn btn-secondary';
        editBtn.textContent = 'Upravit';
        editBtn.addEventListener('click', function () { openForm(recipe.id); });
        actions.appendChild(editBtn);

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-danger';
        deleteBtn.textContent = 'Smazat';
        deleteBtn.addEventListener('click', function () { deleteRecipe(recipe.id); });
        actions.appendChild(deleteBtn);

        detailContentEl.appendChild(actions);

        showView('detail');
    }

    function parseLines(text) {
        if (!text) return [];
        return text.split('\n')
            .map(function (l) { return l.trim(); })
            .filter(function (l) { return l.length > 0; });
    }

    // ----- Formulář -----
    function openForm(idOrEvent) {
        const id = typeof idOrEvent === 'string' ? idOrEvent : null;
        formEl.reset();
        editingId = id;

        if (id) {
            const recipe = recipes.find(function (r) { return r.id === id; });
            if (!recipe) return;
            formTitleEl.textContent = 'Upravit recept';
            formEl.elements.title.value = recipe.title || '';
            formEl.elements.category.value = recipe.category || 'Hlavní jídlo';
            formEl.elements.servings.value = recipe.servings || 4;
            formEl.elements.time.value = recipe.time || 30;
            formEl.elements.ingredients.value = recipe.ingredients || '';
            formEl.elements.instructions.value = recipe.instructions || '';
            formEl.elements.notes.value = recipe.notes || '';
        } else {
            formTitleEl.textContent = 'Nový recept';
        }

        showView('form');
        formEl.elements.title.focus();
    }

    function handleFormSubmit(event) {
        event.preventDefault();
        const data = new FormData(formEl);
        const title = (data.get('title') || '').toString().trim();
        if (!title) return;

        const now = Date.now();
        const recipeData = {
            title: title,
            category: (data.get('category') || '').toString(),
            servings: parseInt(data.get('servings'), 10) || null,
            time: parseInt(data.get('time'), 10) || null,
            ingredients: (data.get('ingredients') || '').toString(),
            instructions: (data.get('instructions') || '').toString(),
            notes: (data.get('notes') || '').toString(),
            updatedAt: now,
        };

        if (editingId) {
            const idx = recipes.findIndex(function (r) { return r.id === editingId; });
            if (idx !== -1) {
                recipes[idx] = Object.assign({}, recipes[idx], recipeData);
            }
        } else {
            recipeData.id = generateId();
            recipeData.createdAt = now;
            recipes.push(recipeData);
        }

        saveRecipes();
        const targetId = editingId || recipeData.id;
        editingId = null;
        showDetail(targetId);
    }

    function deleteRecipe(id) {
        const recipe = recipes.find(function (r) { return r.id === id; });
        if (!recipe) return;
        const ok = window.confirm('Opravdu chceš smazat recept "' + recipe.title + '"?');
        if (!ok) return;
        recipes = recipes.filter(function (r) { return r.id !== id; });
        saveRecipes();
        showList();
    }
})();
