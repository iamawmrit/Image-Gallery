// Search - filter by filename

class Search {
    constructor() {
        this.input = document.getElementById('search-input')
        this.init()
    }

    init() {
        this.input.addEventListener('input', Utils.debounce((e) => {
            const query = e.target.value.trim()
            window.appEvents.emit('filter:search', query)
        }, 300))

        this.input.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.input.value = ''
                this.input.blur()
                window.appEvents.emit('filter:search', '')
            }
        })

        // Cmd+F to focus search
        document.addEventListener('keydown', (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
                e.preventDefault()
                this.input.focus()
                this.input.select()
            }
        })
    }

    clear() {
        this.input.value = ''
        window.appEvents.emit('filter:search', '')
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.search = new Search()
})
