package me.yeonhyuk.heavy_traffic.spring_webflux_jooq.auth;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.Jws;
import io.jsonwebtoken.JwtParser;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.MalformedJwtException;
import io.jsonwebtoken.UnsupportedJwtException;
import io.jsonwebtoken.security.SignatureException;
import me.yeonhyuk.heavy_traffic.spring_webflux_jooq.common.ApiException;
import me.yeonhyuk.heavy_traffic.spring_webflux_jooq.common.ResultCodeEnum;
import org.springframework.stereotype.Component;

import java.security.KeyFactory;
import java.security.interfaces.RSAPublicKey;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;
import java.util.UUID;

/**
 * JWT(RS256, RSA-2048) 를 검증하고 {@code userPk} 를 추출한다 (SR §4).
 * 실패 시 {@link ApiException} 을 던지며, 상위에서 표준 응답(HTTP 200 + resultCode)으로 변환된다.
 */
@Component
public class JwtAuthenticator {

    private static final String BEARER_PREFIX = "Bearer ";
    private static final String REQUIRED_ALGORITHM = "RS256";
    private static final String USER_PK_CLAIM = "userPk";

    private final JwtParser parser;

    public JwtAuthenticator(JwtProperties properties) {
        this.parser = Jwts.parser()
                .verifyWith(loadPublicKey(properties.publicKey()))
                .requireIssuer(properties.issuer())
                .build();
    }

    /**
     * Authorization 헤더 값을 검증하고 사용자 PK 를 반환한다.
     *
     * @param authorizationHeader {@code Bearer <token>} 형식의 헤더 값 (null 가능)
     * @return 토큰에서 추출한 사용자 PK
     * @throws ApiException 토큰 누락/형식오류/서명오류/만료/발급자불일치/알고리즘불일치 시
     */
    public UUID authenticate(String authorizationHeader) {
        if (authorizationHeader == null || !authorizationHeader.startsWith(BEARER_PREFIX)) {
            throw new ApiException(ResultCodeEnum.TOKEN_MISSING);
        }
        String token = authorizationHeader.substring(BEARER_PREFIX.length()).trim();

        Jws<Claims> jws;
        try {
            jws = parser.parseSignedClaims(token);
        } catch (ExpiredJwtException e) {
            throw new ApiException(ResultCodeEnum.TOKEN_EXPIRED, e);
        } catch (SignatureException e) {
            throw new ApiException(ResultCodeEnum.TOKEN_INVALID_SIGNATURE, e);
        } catch (io.jsonwebtoken.IncorrectClaimException | io.jsonwebtoken.MissingClaimException e) {
            // requireIssuer 불일치/누락
            throw new ApiException(ResultCodeEnum.TOKEN_INVALID_ISSUER, e);
        } catch (UnsupportedJwtException | MalformedJwtException | IllegalArgumentException e) {
            throw new ApiException(ResultCodeEnum.TOKEN_MALFORMED, e);
        }

        String algorithm = jws.getHeader().getAlgorithm();
        if (!REQUIRED_ALGORITHM.equals(algorithm)) {
            throw new ApiException(ResultCodeEnum.TOKEN_INVALID_ALGORITHM);
        }

        Object userPk = jws.getPayload().get(USER_PK_CLAIM);
        if (userPk == null) {
            throw new ApiException(ResultCodeEnum.TOKEN_MALFORMED);
        }
        try {
            return UUID.fromString(userPk.toString());
        } catch (IllegalArgumentException e) {
            throw new ApiException(ResultCodeEnum.TOKEN_MALFORMED, e);
        }
    }

    private static RSAPublicKey loadPublicKey(String base64Der) {
        try {
            byte[] der = Base64.getDecoder().decode(base64Der.trim());
            X509EncodedKeySpec spec = new X509EncodedKeySpec(der);
            return (RSAPublicKey) KeyFactory.getInstance("RSA").generatePublic(spec);
        } catch (Exception e) {
            throw new IllegalStateException("JWT 공개키(jwt.public-key) 로드 실패", e);
        }
    }
}
