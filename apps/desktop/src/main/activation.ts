interface AppActivator {
  focus(options: { steal: boolean }): void;
}

interface PopupActivator {
  show(): void;
  focus(): void;
}

export function activatePopup(app: AppActivator, popup: PopupActivator): void {
  app.focus({ steal: true });
  popup.show();
  popup.focus();
}
