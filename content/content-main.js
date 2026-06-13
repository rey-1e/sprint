(() => {
  window.addEventListener("sprint-get-monaco-code", () => {
    try {
      if (window.monaco && typeof window.monaco.editor === 'object') {
        const models = window.monaco.editor.getModels();
        if (models && models.length > 0) {
          // Find active user-editor model while ignoring JSON or markdown structures
          const targetModel = models.find(m => {
            if (typeof m.getLanguageId !== 'function' && typeof m.getModeId !== 'function') return false;
            const lang = (m.getLanguageId ? m.getLanguageId() : m.getModeId ? m.getModeId() : "").toLowerCase();
            return lang !== 'json' && lang !== 'markdown' && typeof m.getValue === 'function' && m.getValue().trim().length > 0;
          }) || models[0];

          if (targetModel && typeof targetModel.getValue === 'function') {
            const code = targetModel.getValue();
            window.dispatchEvent(new CustomEvent("sprint-monaco-code-response", { detail: { code } }));
            return;
          }
        }
      }
    } catch (e) {
      console.error("Sprint Monaco Extract Error:", e);
    }
    window.dispatchEvent(new CustomEvent("sprint-monaco-code-response", { detail: { code: null } }));
  });
})();