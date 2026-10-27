proxy_pass http://127.0.0.1:3250;
proxy_http_version 1.1;
proxy_set_header Host $http_x_forwarded_host;
proxy_set_header X-Forwarded-Host $http_x_forwarded_host;
proxy_set_header X-Forwarded-Proto $http_x_forwarded_proto;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_buffering off;
proxy_read_timeout 240s;
proxy_redirect off;
