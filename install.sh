cp coop.service /etc/systemd/system/coop.service
chmod 664 /etc/systemd/system/coop.service
systemctl daemon-reload
systemctl start coop.service