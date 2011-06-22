/* -*- mode: js2; js2-basic-offset: 4; indent-tabs-mode: nil -*- */

const Lang = imports.lang;
const Signals = imports.signals;
const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;
const Pango = imports.gi.Pango;
const St = imports.gi.St;
const Shell = imports.gi.Shell;

const ModalDialog = imports.ui.modalDialog;

const LIST_ITEM_ICON_SIZE = 48;

function _setLabelText(label, text) {
    if (text) {
        label.set_text(text);
        label.show();
    } else {
        label.set_text('');
        label.hide();
    }
}

function ListItem(app) {
    this._init(app);
}

ListItem.prototype = {
    _init: function(app) {
        this._app = app;

        let layout = new St.BoxLayout({ vertical: false});

        this.actor = new St.Button({ style_class: 'show-processes-dialog-app-list-item',
                                     can_focus: true,
                                     child: layout,
                                     reactive: true,
                                     x_align: St.Align.START,
                                     x_fill: true });

        this._icon = this._app.create_icon_texture(LIST_ITEM_ICON_SIZE);

        let iconBin = new St.Bin({ style_class: 'show-processes-dialog-app-list-item-icon',
                                   child: this._icon });
        layout.add(iconBin);

        this._nameLabel = new St.Label({ text: this._app.get_name(),
                                         style_class: 'show-processes-dialog-app-list-item-name' });
        let labelBin = new St.Bin({ y_align: St.Align.MIDDLE,
                                    child: this._nameLabel });
        layout.add(labelBin);

        this.actor.connect('clicked', Lang.bind(this, this._onClicked));
    },

    _onClicked: function() {
        this.emit('activate');
        this._app.activate(-1);
    }
};
Signals.addSignalMethods(ListItem.prototype);

function ShellMountOperation(source) {
    this._init(source);
}

ShellMountOperation.prototype = {
    _init: function(source) {
        this._processesDialog = null;

        this.mountOp = new Shell.MountOperation();

        this.mountOp.connect('ask-question',
                             Lang.bind(this, this._onAskQuestion));
        this.mountOp.connect('ask-password',
                             Lang.bind(this, this._onAskPassword));
        this.mountOp.connect('show-processes-2',
                             Lang.bind(this, this._onShowProcesses2));
        this.mountOp.connect('aborted',
                             Lang.bind(this, this._onAborted));

        this._icon = new St.Icon({ gicon: source.get_icon(),
                                   style_class: 'shell-mount-operation-icon' });
    },

    _onAskQuestion: function(op, message, choices) {
        // TODO
    },

    _onAskPassword: function(op, message, defaultUser, defaultDomain, flags) {
        // TODO
    },

    _onAborted: function(op) {
        // TODO
    },

    _onShowProcesses2: function(op) {
        let processes = op.get_show_processes_pids();
        let choices = op.get_show_processes_choices();
        let message = op.get_show_processes_message();

        if (!this._processesDialog) {
            this._processesDialog = new ShellProcessesDialog(this._icon);
            this._processesDialog.connect('choice-chosen', 
                                          Lang.bind(this, function(object, choice) {
                                              if (choice == -1) {
                                                  this.mountOp.reply(Gio.MountOperationResult.ABORTED);
                                              } else {
                                                  this.mountOp.set_choice(choice);
                                                  this.mountOp.reply(Gio.MountOperationResult.HANDLED);
                                              }

                                              this._processesDialog.close(global.get_current_time());
                                          }));
            this._processesDialog.open(global.get_current_time());
        }

        this._processesDialog.update(message, processes, choices);
    },
}

function ShellProcessesDialog(icon) {
    this._init(icon);
}

ShellProcessesDialog.prototype = {
    __proto__: ModalDialog.ModalDialog.prototype,

    _init: function(icon) {
        ModalDialog.ModalDialog.prototype._init.call(this, { styleClass: 'show-processes-dialog' });

        let mainContentLayout = new St.BoxLayout();
        this.contentLayout.add(mainContentLayout, { x_fill: true,
                                                    y_fill: false });

        this._iconBin = new St.Bin({ child: icon });
        mainContentLayout.add(this._iconBin,
                              { x_fill:  true,
                                y_fill:  false,
                                x_align: St.Align.END,
                                y_align: St.Align.MIDDLE });

        let messageLayout = new St.BoxLayout({ vertical: true });
        mainContentLayout.add(messageLayout,
                              { y_align: St.Align.START });

        this._subjectLabel = new St.Label({ style_class: 'show-processes-dialog-subject' });

        messageLayout.add(this._subjectLabel,
                          { y_fill:  false,
                            y_align: St.Align.START });

        this._descriptionLabel = new St.Label({ style_class: 'show-processes-dialog-description' });
        this._descriptionLabel.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
        this._descriptionLabel.clutter_text.line_wrap = true;

        messageLayout.add(this._descriptionLabel,
                          { y_fill:  true,
                            y_align: St.Align.START });

        let scrollView = new St.ScrollView({ style_class: 'show-processes-dialog-app-list'});
        scrollView.set_policy(Gtk.PolicyType.NEVER,
                              Gtk.PolicyType.AUTOMATIC);
        this.contentLayout.add(scrollView,
                               { x_fill: true,
                                 y_fill: true });
        scrollView.hide();

        this._applicationList = new St.BoxLayout({ vertical: true });
        scrollView.add_actor(this._applicationList,
                             { x_fill:  true,
                               y_fill:  true,
                               x_align: St.Align.START,
                               y_align: St.Align.MIDDLE });

        this._applicationList.connect('actor-added',
                                      Lang.bind(this, function() {
                                          if (this._applicationList.get_children().length == 1)
                                              scrollView.show();
                                      }));

        this._applicationList.connect('actor-removed',
                                      Lang.bind(this, function() {
                                          if (this._applicationList.get_children().length == 0)
                                              scrollView.hide();
                                      }));
    },

    _setButtonsForChoices: function(choices) {
        let buttons = [];

        for (let idx = 0; idx < choices.length; idx++) {
            let button = idx;
            buttons.unshift({ label: choices[idx],
                              action: Lang.bind(this, function() {
                                  this.emit('choice-chosen', button);
                              })});
        }

        this.setButtons(buttons);
    },

    _setAppsForPids: function(pids) {
        // remove all the items
        this._applicationList.destroy_children();

        pids.forEach(Lang.bind(this, function(pid) {
            let tracker = Shell.WindowTracker.get_default();
            let app = tracker.get_app_from_pid(pid);

            if (!app)
                return;

            let item = new ListItem(app);
            this._applicationList.add(item.actor, { x_fill: true });

            item.connect('activate',
                         Lang.bind(this, function() {
                             // use -1 to indicate Cancel
                             this.emit('choice-chosen', -1);
                         }));
        }));
    },

    _setLabelsForMessage: function(message) {
        let labels = message.split('\n');

        _setLabelText(this._subjectLabel, labels[0]);
        if (labels.length > 1)
            _setLabelText(this._descriptionLabel, labels[1]);
    },

    update: function(message, processes, choices) {
        this._setLabelsForMessage(message);
        this._setAppsForPids(processes);
        this._setButtonsForChoices(choices);
    }
}
Signals.addSignalMethods(ShellProcessesDialog.prototype);