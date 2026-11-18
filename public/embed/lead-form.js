/*
 * CRM lead form embed.
 *
 *   <form data-crm-lead-form> ...inputs named name, phone, email, message... </form>
 *   <script src="https://<app>/embed/lead-form.js" data-key="ls_..." async></script>
 *
 * Every <form data-crm-lead-form> on the page posts to the workspace's lead
 * source. Any extra inputs are sent too and can be mapped to custom fields.
 * Optional attributes on the form: data-success="Thanks!" data-redirect="/thanks".
 */
(function () {
  var script = document.currentScript;
  if (!script) return;
  var key = script.getAttribute('data-key');
  if (!key) return console.error('[crm] lead-form.js needs data-key');
  var endpoint = new URL('/api/v1/hooks/leads/' + encodeURIComponent(key), script.src).toString();

  function attach(form) {
    if (form.__crmAttached) return;
    form.__crmAttached = true;

    // Honeypot: hidden from people, filled in by bots.
    var hp = document.createElement('input');
    hp.type = 'text';
    hp.name = '_hp';
    hp.tabIndex = -1;
    hp.autocomplete = 'off';
    hp.setAttribute('aria-hidden', 'true');
    hp.style.cssText = 'position:absolute;left:-10000px;width:1px;height:1px;opacity:0';
    form.appendChild(hp);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var button = form.querySelector('[type=submit]');
      if (button) button.disabled = true;

      var data = {};
      new FormData(form).forEach(function (value, name) {
        if (typeof value === 'string') data[name] = value;
      });
      data.page_url = location.href;
      if (document.referrer) data.referrer = document.referrer;
      var params = new URLSearchParams(location.search);
      ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'gclid', 'fbclid'].forEach(function (p) {
        if (params.get(p)) data[p] = params.get(p);
      });

      fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(data),
      })
        .then(function (res) {
          return res.json().then(function (body) {
            if (!res.ok) throw new Error((body && body.error && body.error.message) || 'Could not send');
          });
        })
        .then(function () {
          var redirect = form.getAttribute('data-redirect');
          if (redirect) return void (location.href = redirect);
          var msg = document.createElement('p');
          msg.className = 'crm-lead-form-success';
          msg.textContent = form.getAttribute('data-success') || 'Thank you! We will contact you shortly.';
          form.replaceWith(msg);
        })
        .catch(function (err) {
          if (button) button.disabled = false;
          var msg = form.querySelector('.crm-lead-form-error');
          if (!msg) {
            msg = document.createElement('p');
            msg.className = 'crm-lead-form-error';
            msg.setAttribute('role', 'alert');
            form.appendChild(msg);
          }
          msg.textContent = err.message || 'Something went wrong, please try again.';
        });
    });
  }

  function init() {
    var forms = document.querySelectorAll('form[data-crm-lead-form]');
    for (var i = 0; i < forms.length; i++) attach(forms[i]);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
