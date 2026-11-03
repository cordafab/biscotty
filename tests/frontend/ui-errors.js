// Surface module and asynchronous errors inside the controlled test frame.
const report = value => {
  const message = document.createElement('pre');
  message.setAttribute('role', 'alert');
  message.textContent = String(value);
  document.body.append(message);
};
window.addEventListener('error', event => report(event.message));
window.addEventListener('unhandledrejection', event => report(event.reason?.stack || event.reason));
